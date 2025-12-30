import type { Session } from "$lib/app/session.svelte";
import { jsonParse, safeParse } from "$lib/app/utils";
import r, { LogLevel } from "$lib/app/utils/reporting";
import { SvelteMap } from "svelte/reactivity";
import { GameDiagnostics } from "./game-diagnostics.svelte";
import * as v1 from "./v1/spec";
import type { BaseConnection } from "./ws";

export type GameAction = v1.Action & { active: boolean };

export class Game {
    public readonly actions = $state(new SvelteMap<string, GameAction>());
    public name: string = $state(null!);
    public diagnostics = new GameDiagnostics(this);
    public status = $derived(this.diagnostics.status);
    public startupState: { type: "connected" | "startup"; at: number; } | null = $state(null);

    constructor(
        private readonly session: Session,
        public readonly conn: BaseConnection,
        name?: string
    ) {
        this.name = name ?? v1PendingGameName(conn.id);
        if (conn.version !== "v1") {
            conn.onconnect(() => this.connected());
        }
        conn.onclose(() => {
            // FIXME: should be system ctx
            void this.context(`${this.name} disconnected`, true);
        });
        conn.onmessage((txt) => this.recv(txt));
        conn.onwserror((err) => {
            r.warn(`${this.name} broke its websocket somehow`, {
                details: err,
                toast: { level: LogLevel.Error },
            });
        });
    }

    public get version() {
        return this.conn.version;
    }

    private connected() {
        this.startupState = { type: "connected", at: Date.now() };
        void this.context(`${this.name} connected`, true);
        r.info(`${this.name} connected`, { toast: true });
    }

    async recv(txt: string) {
        const msg = jsonParse(txt)
            .andThen(json => safeParse(v1.zGameMessage, json));
        if (msg.isOk()) {
            await this.processMsg(msg.value);
            return;
        }
        const err = msg.error;
        this.diagnostics.trigger("prot/invalid_message", { message: txt, error: err });
        // TODO: 'strict mode' that raises all severities by 1
        // (warnings become errors, errors become fatal and instantly disconnect WS)
        // await this.conn.disconnect(1006, `Invalid WebSocket message: ${err.message}`);
    }

    async processMsg(msg: v1.GameMessage) {
        r.verbose(`Handling ${msg.command}`);
        if (this.conn.version === "v1") {
            // technically vulnerable but i'd like to see a game out in the wild actually guess its own id
            if (this.name === v1PendingGameName(this.conn.id)) {
                r.debug(`First message for v1 game - taking game name '${msg.game}' from WS msg`);
                this.name = msg.game;
                this.connected();
            } else if (this.name !== msg.game) {
                this.diagnostics.trigger("prot/v1/game_renamed", { old: this.name, new: msg.game });
                this.name = msg.game;
            }
        }
        switch (msg.command) {
            case "startup":
                this.startup();
                break;
            case "context":
                await this.context(msg.data.message, msg.data.silent);
                break;
            case "actions/register":
                this.registerActions(msg.data.actions);
                break;
            case "actions/unregister":
                this.unregisterActions(msg.data.action_names);
                break;
            case "actions/force":
                const actions = msg.data.action_names.map(name => this.getAction(name)!).filter(Boolean);
                if (msg.data.action_names.length === 0) {
                    this.diagnostics.trigger("prot/force/empty", { msg });
                    return;
                }
                if (actions.length < msg.data.action_names.length) {
                    if (actions.length === 0) {
                        this.diagnostics.trigger("prot/force/all_invalid", { msg });
                        return;
                    } else {
                        this.diagnostics.trigger("prot/force/some_invalid", { msg, unknownActions: msg.data.action_names.filter(name => !this.getAction(name)) });
                    }
                }
                // FIXME: mixes in manual/autoact forces
                // FIXME: technically only fires when a force is queued, not just running (so on the third and not second simultaneous force)
                if (this.session.scheduler.forceQueue.length) {
                    this.diagnostics.trigger("prot/force/multiple", { msg });
                }
                this.session.scheduler.forceQueue.push(actions);
                await this.context(this.forceMsg(actions, msg.data.query, msg.data.state), false);
                break;
            case "action/result":
                // TODO: (w) late/action_result
                if (!msg.data.success && !msg.data.message) {
                    this.diagnostics.trigger("prot/result/error_nomessage");
                }
                const silent = msg.data.success;
                let text = `Result for action ${msg.data.id.substring(0, 6)}: ${msg.data.success ? "Performing" : "Failure"}`;
                text += msg.data.message ? ` (${msg.data.message})` : " (no message)";
                await this.context(text, silent);
                break;
            case "shutdown/ready":
                break;
            default:
                r.warn(`(${this.name}) Unimplemented command '${(msg as any).command}'`);
        }
        if (this.startupState?.type !== "startup") {
            this.diagnostics.trigger("prot/startup/missing");
            this.startupState = { type: "startup", at: Date.now() };
        }
    }

    startup() {
        r.info(`(${this.name}) startup`);
        if (this.startupState?.type === "startup") {
            this.diagnostics.trigger("prot/startup/multiple");
        } else {
            const now = Date.now();
            const startupDelay = now - (this.startupState?.at ?? now);
            this.startupState = { type: "startup", at: now };
            if (startupDelay > 500) {
                this.diagnostics.trigger("perf/late/startup", { delay: startupDelay });
            }
        }
    }

    async context(text: string, silent: boolean) {
        this.session.context.client(this, { text, silent });
    }

    getAction(name: string, onlyActive: boolean = true) {
        const action = this.actions.get(name);
        if (onlyActive && !action?.active)
            return undefined;
        return action;
    }

    getActiveActions() {
        return Array.from(this.actions.values().filter(a => a.active));
    }

    async registerActions(actions: v1.Action[]) {
        r.debug(`${this.getActiveActions().length} currently registered actions`);
        let new_actions = 0;
        for (const action of actions) {
            const existing = this.actions.get(action.name);
            if (!existing) { new_actions++; }

            if (existing?.active) {
                // duplicate action conflict resolution
                // v1 drops incoming (ignore new), v2 onwards will drop existing (overwrite with new)
                const isV1 = this.version === "v1";
                if (isV1) this.diagnostics.trigger("prot/v1/register/dupe", { action_name: action.name, existing });
                const logMethod = isV1 ? r.warn : r.info;
                logMethod.bind(r)(`(${this.name}) ${isV1 ? "Ignoring" : "Overwriting"} duplicate action ${action.name} (as per ${this.version} spec)`, { toast: false });
                if (isV1) continue;
            }
            const storedAction = $state({ ...action, active: true });
            this.actions.set(action.name, storedAction);
        }
        if (actions.length > 5) {
            r.debug(`(${this.name}) Registered ${actions.length} actions (${new_actions} new)`);
        } else {
            r.debug(`(${this.name}) Registered actions: [${actions.map(a => a.name).join(", ")}]`);
        }
    }

    async unregisterActions(actions: string[]) {
        for (const action_name of actions) {
            const existing = this.getAction(action_name, false);
            if (!existing) {
                this.diagnostics.trigger("prot/unregister/unknown", { action_name });
            } else if (!existing.active) {
                this.diagnostics.trigger("prot/unregister/inactive", { action_name });
            } else {
                existing.active = false;
                r.debug(`(${this.name}) Unregistered action '${action_name}'`);
            }
        }
        r.debug(`(${this.name}) Actions unregistered: [${actions}]`);
    }

    toString() {
        return `Game { name: "${this.name}", version: "${this.version}"}`;
    }

    private forceMsg(actions: v1.Action[], query?: string, state?: string) {
        const obj = {
            actions: actions.map(a => a.name),
            query,
            state
        };
        const prompt = `You must perform one of the following actions, given this information: ${JSON.stringify(obj)}`;
        return prompt;
    }
}

export function v1PendingGameName(id: string) {
    return `<v1-Pending-${id}>`;
}
