import { Channel, invoke } from "@tauri-apps/api/core";
import * as log from "@tauri-apps/plugin-log";
import { GameWSConnection, type ServerWSEvent, type AcceptArgs } from "./ws";
import * as v1 from "./v1/spec";
import { SvelteMap } from "svelte/reactivity";
import z from "zod";
import type { Session } from "$lib/app/session.svelte";

export type WSConnectionRequest = {
    id: string;
    version: "v1";
} | {
    id: string;
    version: "v2";
    game: string;
};

export const REGISTRY = "registry";

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
            await invoke('ws_deny', { id, reason: "Invalid version" });
            return;
        }
        if (req.version != "v1" && !this.validateGameName(req.game)) {
            await invoke('ws_deny', { id, reason: "Invalid game name" });
            return;
        }
        await this.accept(req);
    }
    
    async accept(req: WSConnectionRequest) {
        const channel = new Channel<ServerWSEvent>();
        const conn = new GameWSConnection(req.id, req.version, channel);
        let gameName = req.version == "v1" ? `<Pending-${conn.id}>` : req.game;
        log.debug(`Creating game for '${gameName}'`);
        this.createGame(gameName, conn);
        await invoke('ws_accept', { id: req.id, channel } satisfies AcceptArgs);
        if (conn.version == "v1") {
            log.debug(`${conn.shortId} is v1; sending 'actions/reregister_all' to get game and actions`);
            await conn.send(v1.zReregisterAll.parse({}));
        }
    }

    createGame(name: string, conn: GameWSConnection) {
        const game = new Game(this.session, name, conn);
        this.games.push(game);
        conn.onclose = () => {
            log.debug(`Game ${game.name} disconnected, removing`);
            const i = this.games.indexOf(game);
            this.games.splice(i, 1);
        };
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
    // python version kept games in state for ui, maybe we don't need to
    // (it reset all internals of a game on disconnect anyway)
    // 1 (global) llm instance means 1 (global) context, so we don't need to keep games around (except for seen actions maybe)
}

export class Game {
    public readonly actions = $state(new SvelteMap<string, v1.Action>());
    public name: string = $state(null!);
    // private readonly seenActions = new Set<string>(); // log new actions
    constructor(
        private readonly session: Session,
        name: string,
        public readonly conn: GameWSConnection,
    ) {
        this.name = name;
        conn.onmessage = (txt) => this.recv(txt);
    }

    public get version() {
        return this.conn.version
    }

    async recv(txt: string) {
        const msgMaybe = JSON.parse(txt);
        const msg = v1.zGameMessage.safeParse(msgMaybe);
        if (!msg.success) {
            const err = z.treeifyError(msg.error);
            log.error(`Invalid message: ${txt}\n\tzod error: ${err}`);
            await this.conn.disconnect(1006, `Invalid message: ${err}`);
            return;
        }
        await this.handle(msg.data);
    }

    async handle(msg: v1.GameMessage) {
        log.trace(`Handling ${msg.command}`);
        if (this.conn.version == "v1" && this.name === `<Pending-${this.conn.id}>`) {
            // technically vulnerable but i'd like to see a game out in the wild actually guess its own id
            // could also just replace the game name on every single message, it's UB in the v1 spec so we can do whatever
            log.debug(`First message for v1 game - taking game name '${msg.game}' from WS msg`);
            this.name = msg.game;
        }
        switch (msg.command) {
            case "startup":
                log.info(`startup woo`);
                break;
            case "context":
                this.session.context.client(this.name, msg.data.message, { silent: msg.data.silent });
                break;
            case "actions/register":
                this.registerActions(msg.data.actions);
                break;
            case "actions/unregister":
                this.unregisterActions(msg.data.actionNames);
                break;
            case "actions/force":
                break;
            case "action/result":
                const silent = msg.data.success;
                let text = `Result for action ${msg.data.id.substring(0, 6)}: ${msg.data.success ? "Performing" : "Failure"}`;
                this.session.context.client(this.name, text, { silent });
                break;
            case "shutdown/ready":
                break;
            default:
                log.warn(`Unimplemented command '${(msg as any).command}'`);
        }
    }

    async registerActions(actions: v1.Action[]) {
        log.info(`${this.actions.size} existing actions`);
        for (const action of actions) {
            if (this.actions.has(action.name)) {
                // duplicate action conflict resolution
                // v1 drops incoming (ignore new), v2 onwards will drop existing (overwrite with new)
                const isV1 = this.version == "v1";
                const logMethod = isV1 ? log.warn : log.info;
                logMethod(`${isV1 ? "Ignoring" : "Overwriting"} duplicate action ${action.name} (as per ${this.version} spec)`);
                if (isV1) continue;
            }
            this.actions.set(action.name, action);
        }
        if (actions.length > 3) {
            log.info(`Registered ${actions.length} actions`);
        } else {
            log.info(`Registered actions: [${actions.map(a => a.name).join(", ")}]`);
        }
    }

    async unregisterActions(actions: string[]) {
        for (const action_name of actions) {
            const existed = this.actions.delete(action_name);
            const logMethod = existed ? log.info : log.warn;
            logMethod(`Unregistered ${existed ? '' : 'non-'}existing action ${action_name}`);
        }
        log.info(`Actions unregistered: [${actions}]`);
    }

    toString() {
        return `Game { name: "${this.name}", version: "${this.version}"}`;
    }
}
