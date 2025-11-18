import { Channel } from "@tauri-apps/api/core";
import r, { LogLevel } from "$lib/app/utils/reporting";
import { GameWSConnection, type ServerWSEvent, type AcceptArgs, BaseWSConnection } from "./ws";
import * as v1 from "./v1/spec";
import { SvelteMap } from "svelte/reactivity";
import { safeInvoke } from "$lib/app/utils";
import type { Session } from "$lib/app/session.svelte";

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
        if (req.version != "v1" && req.version != "v2") {
            await safeInvoke('ws_deny', { id, reason: "Invalid version" });
            return;
        }
        if (req.version != "v1" && !this.validateGameName(req.game)) {
            await safeInvoke('ws_deny', { id, reason: "Invalid game name" });
            return;
        }
        await this.accept(req);
    }
    
    async accept(req: WSConnectionRequest) {
        const channel = new Channel<ServerWSEvent>();
        const conn = new GameWSConnection(req.id, req.version, channel);
        let gameName = req.version == "v1" ? `<Pending-${conn.id}>` : req.game;
        r.debug(`Creating game '${gameName}' (${req.version})`);
        this.createGame(gameName, conn);
        await safeInvoke('ws_accept', { id: req.id, channel } satisfies AcceptArgs);
        if (conn.version == "v1") {
            r.debug(`${conn.shortId} is v1; sending 'actions/reregister_all' to get game and actions`);
            await conn.send(v1.zReregisterAll.decode({}));
        }
    }

    createGame(name: string, conn: BaseWSConnection): Game {
        const game = new Game(this.session, name, conn);
        this.games.push(game);
        conn.onclose(() => {
            r.info(`${game.name} disconnected`, { toast: true });
            const i = this.games.indexOf(game);
            this.games.splice(i, 1);
        });
        return game;
    }

    getGame(id: string) {
        return this.games.find(g => g.conn.id == id || g.conn.shortId == id);
    }

    validateGameName(name: string): boolean {
        // TODO
        return true;
    }

    dispose() {
        for (const game of this.games) {
            game.conn.dispose();
        }
        this.games.length = 0;
    }

    // TODO: v1 conn (new game) then v2 conn for same game
    // tldr: each connection is a new game, keeping disconnected games in UI (for action list) is undecided
}

export class Game {
    public readonly actions = $state(new SvelteMap<string, v1.Action>());
    public name: string = $state(null!);
    // private readonly seenActions = new Set<string>(); // log new actions
    constructor(
        private readonly session: Session,
        name: string,
        public readonly conn: BaseWSConnection,
    ) {
        this.name = name;
        conn.onconnect(() => r.info(`${this.name} connected`, { toast: true }));
        conn.onmessage((txt) => this.recv(txt));
        conn.onwserror((err) => {
            r.warn(`${this.name} broke its websocket`, {
                details: err,
                toast: { level: LogLevel.Error },
            });
        });
    }

    public get version() {
        return this.conn.version
    }

    async recv(txt: string) {
        const msgMaybe = JSON.parse(txt);
        if (!msgMaybe) {
            await this.conn.disconnect(1006, "Empty WebSocket message (must have 'command' property)");
            return;
        }
        const msg = v1.zGameMessage.safeParse(msgMaybe);
        if (!msg.success) {
            const err = msg.error;
            r.error(`${this.name} sent invalid WebSocket message`, {
                toast: {
                    id: `invalid-websocket-message(${this.conn.shortId})`,
                    description: `Error(s): ${err.message}\nMessage: ${txt}`,
                },
                ctx: {
                    issues: err.issues,
                    message: txt,
                },
            });
            await this.conn.disconnect(1006, `Invalid WebSocket message: ${err.message}`);
            return;
        }
        await this.handle(msg.data);
    }

    async handle(msg: v1.GameMessage) {
        r.verbose(`Handling ${msg.command}`);
        if (this.conn.version == "v1") {
            // technically vulnerable but i'd like to see a game out in the wild actually guess its own id
            // could also just replace the game name on every single message, it's UB in the v1 spec so we can do whatever
            if (this.name === `<Pending-${this.conn.id}>`) {
                r.debug(`First message for v1 game - taking game name '${msg.game}' from WS msg`);
            } else if (this.name !== msg.game) {
                r.warn(`${this.name} changed name to ${msg.game}`);
            }
            this.name = msg.game;
        }
        switch (msg.command) {
            case "startup":
                r.info(`(${this.name}) startup woo`);
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
                // TODO: see what happens when we're already busy generating (race conditions)
                this.session.scheduler.forceAct();
                break;
            case "action/result":
                const silent = msg.data.success;
                let text = `Result for action ${msg.data.id.substring(0, 6)}: ${msg.data.success ? "Performing" : "Failure"}`;
                text += msg.data.message ? `: ${msg.data.message}` : " (no message)";
                await this.context(text, silent);
                break;
            case "shutdown/ready":
                break;
            default:
                r.warn(`(${this.name}) Unimplemented command '${(msg as any).command}'`);
        }
    }

    async context(text: string, silent: boolean) {
        this.session.context.client(this.name, { text, silent });
        if (!silent) {
            this.session.scheduler.actPending = true;
        }
    }

    async registerActions(actions: v1.Action[]) {
        r.debug(`${this.actions.size} existing actions`);
        for (const action of actions) {
            if (this.actions.has(action.name)) {
                // duplicate action conflict resolution
                // v1 drops incoming (ignore new), v2 onwards will drop existing (overwrite with new)
                const isV1 = this.version == "v1";
                const logMethod = isV1 ? r.warn : r.info;
                logMethod.bind(r)(`(${this.name}) ${isV1 ? "Ignoring" : "Overwriting"} duplicate action ${action.name} (as per ${this.version} spec)`);
                if (isV1) continue;
            }
            this.actions.set(action.name, action);
        }
        if (actions.length > 5) {
            r.debug(`(${this.name}) Registered ${actions.length} actions`);
        } else {
            r.debug(`(${this.name}) Registered actions: [${actions.map(a => a.name).join(", ")}]`);
        }
    }

    async unregisterActions(actions: string[]) {
        for (const action_name of actions) {
            const existed = this.actions.delete(action_name);
            const logMethod = existed ? r.debug : r.warn;
            logMethod.bind(r)(`(${this.name}) Unregistered ${existed ? '' : 'non-'}existing action ${action_name}`);
        }
        r.debug(`(${this.name}) Actions unregistered: [${actions}]`);
    }

    toString() {
        return `Game { name: "${this.name}", version: "${this.version}"}`;
    }
}
