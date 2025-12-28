import { Channel } from "@tauri-apps/api/core";
import r, { LogLevel } from "$lib/app/utils/reporting";
import { GameWSConnection, type ServerWSEvent, type AcceptArgs, type BaseWSConnection } from "./ws";
import * as v1 from "./v1/spec";
import { SvelteMap } from "svelte/reactivity";
import { jsonParse, safeInvoke, safeParse } from "$lib/app/utils";
import type { Session } from "$lib/app/session.svelte";
import { getDiagnosticById, DiagnosticSeverity, type GameDiagnostic } from "./diagnostics";

export type WSConnectionRequest = {
    id: string;
    version: "v1";
} | {
    id: string;
    version: "v2";
    game: string;
};

export class Registry {
    public games: Game[] = $state([]);

    private readonly session: Session;

    constructor(session: Session) {
        this.session = session;
        this.session.onDispose(() => this.dispose());
        console.log(`Created registry for session ${session.name} (${session.id})`);
    }

    async tryConnect(req: WSConnectionRequest) {
        const id = req.id;
        // approve/deny connection
        if (req.version !== "v1" && req.version !== "v2") {
            await safeInvoke('ws_deny', { id, reason: "Invalid version" });
            return;
        }
        if (req.version !== "v1" && !this.validateGameName(req.game)) {
            await safeInvoke('ws_deny', { id, reason: "Invalid game name" });
            return;
        }
        await this.accept(req);
    }
    
    async accept(req: WSConnectionRequest) {
        const channel = new Channel<ServerWSEvent>();
        const conn = new GameWSConnection(req.id, req.version, channel);
        const gameName = req.version === "v1" ? v1PendingGameName(conn.id) : req.game;
        r.debug(`Creating game '${gameName}' (${req.version})`);
        this.createGame(conn);
        await safeInvoke('ws_accept', { id: req.id, channel } satisfies AcceptArgs);
        if (conn.version === "v1") {
            r.debug(`${conn.shortId} is v1; sending 'actions/reregister_all' to get game and actions`);
            await conn.send(v1.zReregisterAll.decode({}));
        }
    }

    createGame(conn: BaseWSConnection, name?: string): Game {
        const game = new Game(this.session, conn, name);
        this.games.push(game);
        conn.onclose(() => {
            r.info(`${game.name} disconnected`, { toast: true });
            // each connection is a new game
            // TODO: keeping disconnected games in UI (for action list/diagnostics) is undecided
            const i = this.games.indexOf(game);
            this.games.splice(i, 1);
        });
        return game;
    }

    getGame(id: string) {
        return this.games.find(g => g.conn.id === id || g.conn.shortId === id);
    }

    validateGameName(_name: string): boolean {
        // TODO: v2 spec
        return true;
    }

    dispose() {
        for (const game of this.games) {
            game.conn.dispose();
        }
        this.games.length = 0;
    }
}

export type GameAction = v1.Action & { active: boolean };

export class Game {
    public readonly actions = $state(new SvelteMap<string, GameAction>());
    public name: string = $state(null!);
    public diagnostics: GameDiagnostic[] = $state([]);
    public strict: boolean = $state(false);

    constructor(
        private readonly session: Session,
        public readonly conn: BaseWSConnection,
        name?: string,
    ) {
        this.name = name ?? v1PendingGameName(conn.id);
        if (conn.version !== "v1") {
            conn.onconnect(() => this.connected());
        }
        conn.onclose(() => {
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

    public get status(): 'ok' | 'warn' | 'error' {
        let status: 'ok' | 'warn' = 'ok';
        for (const {id, dismissed} of this.diagnostics) {
            if (dismissed) continue;
            
            const diag = getDiagnosticById(id);
            if (!diag) continue;
            
            if (diag.severity === DiagnosticSeverity.Error) {
                return 'error';
            } else if (diag.severity === DiagnosticSeverity.Warning) {
                status = 'warn';
            }
        }
        return status;
    }

    public triggerDiagnostic(id: string, context?: any) {
        if (!getDiagnosticById(id)) return;

        this.diagnostics.push({
            id,
            timestamp: Date.now(),
            context,
        });
    }

    public dismissDiagnosticsById(id: string) {
        this.diagnostics.forEach(d => d.id === id && (d.dismissed = true));
    }

    public clearAllDiagnostics() {
        this.diagnostics.length = 0;
    }

    private connected() {
        void this.context(`${this.name} connected`, true);
        r.info(`${this.name} connected`, { toast: true });
    }

    async recv(txt: string) {
        const msg = jsonParse(txt)
            .andThen(json => safeParse(v1.zGameMessage, json));
        if (msg.isErr()) {
            const err = msg.error;
            this.triggerDiagnostic("prot/invalid_message", { message: txt, error: err });
            r.error(`${this.name} sent invalid WebSocket message`, {
                toast: {
                    id: `invalid-websocket-message(${this.conn.shortId})`,
                    description: `Error(s): ${err.message}\nMessage: ${txt}`,
                },
                ctx: {
                    issues: "issues" in err ? err.issues : undefined,
                    message: txt,
                },
            });
            if (this.strict) {
                await this.conn.disconnect(1006, `Invalid WebSocket message: ${err.message}`);
            }
            return;
        }
        await this.processMsg(msg.value);
    }

    async processMsg(msg: v1.GameMessage) {
        r.verbose(`Handling ${msg.command}`);
        if (this.conn.version === "v1") {
            // technically vulnerable but i'd like to see a game out in the wild actually guess its own id
            if (this.name === v1PendingGameName(this.conn.id)) {
                r.debug(`First message for v1 game - taking game name '${msg.game}' from WS msg`);
                this.connected();
            } else if (this.name !== msg.game) {
                r.warn(`${this.name} changed name to ${msg.game}`);
            }
            this.name = msg.game;
        }
        switch (msg.command) {
            case "startup":
                r.info(`(${this.name}) startup woo`);
                // TODO: (w) prot/multiple_startup
                // TODO: (i) late.startup
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
                if (actions.length < msg.data.action_names.length) {
                    if (msg.data.action_names.length === 0) {
                        r.error(`(${this.name}) Sent actions/force with no actions`, { ctx: {msg} });
                    } else {
                        r.warn(`(${this.name}) actions/force contained unknown/unregistered action names: ${msg.data.action_names.filter(name => !this.getAction(name)).join(", ")}`);
                    }
                }
                this.session.scheduler.forceQueue.push(actions);
                await this.context(this.forceMsg(actions, msg.data.query, msg.data.state), false);
                break;
            case "action/result":
                // TODO: late.action_result
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
        // TODO: (w) prot/missing_startup
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
                if (isV1) this.triggerDiagnostic("prot/dupe_action_register_v1", { action_name: action.name, existing });
                const logMethod = isV1 ? r.warn : r.info;
                logMethod.bind(r)(`(${this.name}) ${isV1 ? "Ignoring" : "Overwriting"} duplicate action ${action.name} (as per ${this.version} spec)`);
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
                // TODO: prot/bad_unregister
                r.warn(`(${this.name}) Unregistered unknown action '${action_name}'!`);
            } else if (!existing.active) {
                // TODO: prot/dupe_unregister
                r.info(`(${this.name}) Action '${action_name}' already unregistered`);
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

function v1PendingGameName(id: string) {
    return `<v1-Pending-${id}>`;
}