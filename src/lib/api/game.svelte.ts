import type { Session } from "$lib/app/session.svelte";
import { jsonParse, localeTimeWithMs, safeParse } from "$lib/app/utils";
import r, { LogLevel } from "$lib/app/utils/reporting";
import { SvelteMap } from "svelte/reactivity";
import { GameDiagnostics } from "./game-diagnostics.svelte";
import { TIMEOUTS } from "./diagnostics";
import * as v1 from "./v1/spec";
import type { BaseConnection } from "./connection";
import dayjs from "dayjs";
import { dequal } from "dequal/lite";
import type { Message } from "$lib/app/context.svelte";

export type GameAction = v1.Action & { active: boolean };
export type PendingAction = {
    actData: v1.ActData,
    sentAt: number,
    timeout: ReturnType<typeof setTimeout>,
    v1Force?: v1.ForceAction,
};

export class Game {
    public readonly actions = $state(new SvelteMap<string, GameAction>());
    public name: string = $state(null!);
    public diagnostics = new GameDiagnostics(this);
    public status = $derived(this.diagnostics.status);
    public startupState: { type: "connected" | "implied" | "startup"; at: number; } | null = $state(null);
    private pendingActions = $state(new SvelteMap<string, PendingAction>());
    private forceQueue: v1.ForceAction[] = $state([]);

    constructor(
        public readonly session: Session,
        public readonly conn: BaseConnection,
        name?: string
    ) {
        this.name = name ?? v1PendingGameName(conn.id);
        const dispose = $effect.root(() => {
            $effect(() => {
                if (this.forceQueue.length && !this.pendingActions.size) {
                    const force = this.forceQueue.shift()!;
                    this.forceAction(force);
                }
            });
        });
        conn.onclose(dispose);

        conn.onconnect(() => {
            this.startupState = { type: "connected", at: Date.now() };
            if (conn.version !== "v1") {
                this.connected();
            }
        });
        conn.onclose(() => {
            if (this.name === v1PendingGameName(conn.id)) return;
            r.info(`${this.name} disconnected`);
            void this.session.context.system({ text: `${this.name} disconnected`, silent: true });
            this.clearPendingActions();
            this.forceQueue.length = 0;
        });
        conn.onmessage((txt) => this.recv(txt));
        conn.onerror((err) => {
            r.warn(`${this.name} broke its websocket somehow`, {
                details: err,
                toast: { level: LogLevel.Error },
            });
        });
    }

    public get version() {
        return this.conn.version;
    }

    public get gamePrefs() {
        return this.session.userPrefs.getGamePrefs(this.name);
    }

    private connected() {
        void this.session.context.system({ text: `${this.name} connected`, silent: true });
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
                // allowed for now but eventually will have to remove this (too much complexity)
                this.name = msg.game;
            }
        }
        switch (msg.command) {
            case "startup":
                this.startup();
                break;
            case "context":
                this.context(msg.data.message, msg.data.silent);
                break;
            case "actions/register":
                this.registerActions(msg.data.actions);
                break;
            case "actions/unregister":
                this.unregisterActions(msg.data.action_names);
                break;
            case "actions/force":
                await this.forceAction(msg);
                break;
            case "action/result":
                await this.actionResult(msg);
                break;
            case "shutdown/ready":
                break;
            default:
                r.warn(`(${this.name}) Unimplemented command '${(msg as any).command}'`);
        }
        if (!["startup", "implied"].includes(this.startupState?.type ?? "")) {
            this.diagnostics.trigger("prot/startup/missing", { firstMessage: { msg } });
            this.startupState = { type: "implied", at: Date.now() };
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
            r.info(`Startup delay: ${startupDelay}`);
            if (startupDelay > TIMEOUTS["perf/late/startup"]) {
                this.diagnostics.trigger("perf/late/startup", { delayMs: startupDelay });
            }
        }
        // TODO: diag suggest sending context (game info/rules) on connect
        // (like a 1s timer after startup or sth)
    }

    context(text: string, silent: Message['silent']) {
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

    private checkActionSchema(action: v1.Action) {
        const { name, schema } = action;
        if (!schema) return;
        // for some reason spec allows {} for parameterless actions (some quantity of zaza was definitely involved)
        // there's some tricks with hasOwn and Object.keys and all that funny stuff
        // but this object comes from JSON.parse so we don't need to be clever at all
        let isEmpty = true;
        for (const _ in schema) {
            isEmpty = false;
            break;
        }
        if (isEmpty) {
            this.diagnostics.trigger("prot/schema/prefer_omit_to_empty", { action: name }, false);
            return;
        }
        if (schema.type !== "object") {
            this.diagnostics.trigger("prot/schema/type_object", { action: name, schema }, false);
        }

        if (!('additionalProperties' in schema)) {
            this.diagnostics.trigger("prot/schema/additionalProperties", { action: name, schema }, false);
        }
    }

    async registerActions(actions: v1.Action[]) {
        r.debug(`${this.getActiveActions().length} currently registered actions`);
        let new_actions = 0;
        for (const action of actions) {
            const existing = this.actions.get(action.name);
            let schemaUpdated = false;
            if (!existing) {
                new_actions++;
                schemaUpdated = true;
            } else {
                const {active: wasActive, ...rawExisting} = existing;
                if (!dequal(action.schema, rawExisting.schema)) {
                    schemaUpdated = true;
                }
                if (wasActive) {
                    // duplicate action conflict resolution
                    // v1 drops incoming (ignore new), v2 onwards will drop existing (overwrite with new)
                    const isV1 = this.version === "v1";
                    const isIdentical = action.description === rawExisting.description
                        && !schemaUpdated;
                    if (isIdentical) {
                        this.diagnostics.trigger("perf/register/identical_duplicate", { action: action.name });
                        r.info(`Skipped registering identical duplicate of action ${action.name}`);
                        continue; // skip since it doesn't matter (already active too)
                    } else if (isV1) {
                        this.diagnostics.trigger("prot/v1/register/conflict", {
                            incoming: action,
                            existing: rawExisting,
                        });
                    }
                    const logMethod = isV1 ? r.warn : r.info;
                    logMethod.bind(r)(`(${this.name}) ${isV1 ? "Ignoring" : "Overwriting"} duplicate action ${action.name} (as per ${this.version} spec)`, { toast: false });
                    if (isV1) continue;                    
                }
            }
            if (schemaUpdated) {
                this.checkActionSchema(action);
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

    async forceAction(msg: v1.ForceAction) {
        if (this.pendingActions.size) {
            this.diagnostics.trigger("prot/force/while_pending_result", {
                pending: this.pendingActions.values().map(prettyPending).toArray(),
                msg,
            });
            this.forceQueue.push(msg);
            return;
        }
        const actions = msg.data.action_names.map(name => this.getAction(name)!).filter(Boolean);
        if (msg.data.action_names.length === 0) {
            this.diagnostics.trigger("prot/force/empty", { msgData: msg.data });
            return;
        }
        if (actions.length < msg.data.action_names.length) {
            if (actions.length === 0) {
                this.diagnostics.trigger("prot/force/all_invalid", { msgData: msg.data });
                return;
            } else {
                this.diagnostics.trigger("prot/force/some_invalid", { msgData: msg.data, unknownActions: msg.data.action_names.filter(name => !this.getAction(name)) });
            }
        }
        // only real forces (from client) - manual/autoact forces exist in the queue but are null
        const realForces = this.session.scheduler.forceQueue.filter(Boolean);
        if (realForces.length + this.forceQueue.length) {
            this.diagnostics.trigger("prot/force/multiple", { msgData: msg.data });
        }
        this.session.scheduler.forceQueue.push(actions);
        const text = this.forceMsg(actions, msg.data.query, msg.data.state);
        this.context(text, "noAct"); // don't act twice from one prompt
    }

    async sendAction(actData: v1.ActData) {
        this.session.context.system({
            text: `Executing action ${actData.name} (Request ID: ${actData.id.substring(0, 8)})`,
            silent: true,
            visibilityOverrides: {
                user: false,
            }
        });
        const sentAt = Date.now();
        const timeout = setTimeout(() => {
            if (this.pendingActions.has(actData.id)) {
                this.diagnostics.trigger("perf/timeout/action_result", prettyPending({actData, sentAt, timeout}));
                this.pendingActions.delete(actData.id);
            }
        }, TIMEOUTS["perf/timeout/action_result"]);
        this.pendingActions.set(actData.id, { actData, sentAt, timeout });
        await this.conn.send(v1.zAct.decode({data: actData}));
    }

    async actionResult(msg: v1.ActionResult) {
        const { id, success, message } = msg.data;
        const pending = this.pendingActions.get(id);
        if (!pending) {
            this.diagnostics.trigger("prot/result/unexpected", { msgData: msg.data });
            return;
        }
        const { actData, sentAt, timeout, v1Force } = pending;
        clearTimeout(timeout);
        const diff = Date.now() - sentAt;
        if (diff > TIMEOUTS["perf/late/action_result"]) {
            this.diagnostics.trigger("perf/late/action_result", prettyPending(pending));
        }
        this.pendingActions.delete(id);
        if (!success && !message) {
            this.diagnostics.trigger("prot/result/error_nomessage");
        }
        let text = `Result for action ${actData.name} (request ID ${id.substring(0, 8)}): ${success ? "Performing" : "Failure"}`;
        text += message ? ` (${message})` : " (no message)";
        // noAct on failure to represent the upcoming retry
        // (in v2+, the game will retry - so we still don't want to trigger acting)
        this.context(text, success || "noAct");
        // v1 spec: Neuro will retry failed `actions/force`s
        if (this.version === "v1" && v1Force) {
            this.forceQueue.unshift(v1Force); // spec says "immediately" so i guess we doom loop
        }
    }

    async manualSend(action: string, data?: any) {
        const actData = v1.zActData.decode({
            name: action,
            data,
        });

        let text = `User act to ${this.name} (request ID ${actData.id.substring(0, 8)}): ${actData.name}`;
        text += (actData.data ? `\nData: ${actData.data}` : " (no data)");
        r.debug(text);
        this.session.context.user({ text: text, silent: true });
        await this.sendAction(actData);
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

    private clearPendingActions() {
        for (const [_id, {timeout}] of this.pendingActions) {
            clearTimeout(timeout);
        }
        this.pendingActions.clear();
    }
}

export function v1PendingGameName(id: string) {
    return `<v1-Pending-${id}>`;
}

function prettyPending(p: PendingAction) {
    return {
        act: p.actData,
        sentAt: localeTimeWithMs(dayjs(p.sentAt))
    };
}
