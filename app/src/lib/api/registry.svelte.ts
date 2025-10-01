import { Channel, invoke } from "@tauri-apps/api/core";
import { debug, info, trace, warn } from "@tauri-apps/plugin-log";
import { GameWSConnection, type ServerWSEvent, type AcceptArgs } from "./ws";
import { type Action, ReregisterAll, GameMessage, Context, RegisterActions, UnregisterActions } from "./v1/spec";

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
        let gameName = req.version != "v1" ? req.game
            : `<Pending-${conn.shortId}>`;
        debug(`Creating game for '${gameName}'`);
        const game = new Game(gameName, conn);
        this.games.push(game);
        conn.onclose = () => {
            debug(`Game ${gameName} disconnected, removing`);
            const i = this.games.indexOf(game);
            this.games.splice(i, 1);
        };
        await invoke('ws_accept', { id: req.id, channel } satisfies AcceptArgs);
        if (conn.version == "v1") {
            debug(`${conn.shortId} is v1; sending 'actions/reregister_all' to get game and actions`);
            await conn.send(new ReregisterAll());
        }
    }

    getGame(id: string) {
        return this.games.find(g => g.conn.id == id || g.conn.shortId == id);
    }

    validateGameName(name: string): boolean {
        // TODO
        return true;
    }
    // TODO: v1 conn (new game) then v2 conn for same game
    // python version kept games in state for ui, maybe we don't need to
    // (it reset all internals of a game on disconnect anyway)
    // if we have 1 llm instance, we don't need to keep games around (except for seen actions maybe)
}

export class Game {
    public readonly actions = $state(new Map<string, Action>());
    public name: string = $state(null!);
    // private readonly seenActions = new Set<string>(); // log new actions
    constructor(
        name: string,
        public readonly conn: GameWSConnection,
    ) {
        this.name = name;
        conn.onmessage = (txt) => this.recv(txt);
    }

    public get version() {
        return this.conn.version
    }

    async registerActions(actions: Action[]) {
        for (const action of actions) {
            if (this.actions.has(action.name)) {
                // duplicate action conflict resolution
                // v1 drops incoming (ignore new), v2 onwards will drop existing (overwrite with new)
                const isV1 = this.version == "v1";
                const logMethod = isV1 ? warn : info;
                logMethod(`${isV1 ? "Ignoring" : "Overwriting"} duplicate action ${action.name} (on ${this.version} connection)`);
                if (isV1) continue;
            }
            this.actions.set(action.name, action);
        }
        if (actions.length > 3) {
            info(`Registered ${actions.length} actions`);
        } else {
            info(`Registered actions: [${actions.map(a => a.name).join(", ")}]`);
        }
        // TEMP: trigger svelte
        const a = this.actions;
        this.actions = null;
        this.actions = a;
    }

    async unregisterActions(actions: string[]) {
        for (const action_name of actions) {
            const existed = this.actions.delete(action_name);
            await trace(`Unregistered ${existed ? '' : 'non-'}existing action ${action_name}`);
        }
        info(`Actions unregistered: [${actions}]`);
    }

    async recv(txt: string) {
        const msg = JSON.parse(txt) as GameMessage;
        await this.handle(msg);
    }

    async handle(msg: GameMessage) {
        trace(`Handling ${msg.command}`);
        if (this.conn.version == "v1" && this.name === `<Pending-${this.conn.shortId}>`) {
            debug(`First message for v1 game - taking game name '${msg.game}' from WS msg`);
            this.name = msg.game;
        }
        switch (msg.command) {
            case "startup":
                info(`Startup`);
                break;
            case "context":
                info(`TODO context: '${(msg as Context).data.message}'`);
                break;
            case "actions/register":
                this.registerActions((msg as RegisterActions).data.actions);
                break;
                case "actions/unregister":
                this.unregisterActions((msg as UnregisterActions).data.actionNames);
                break;
            case "actions/force":
            case "action/result":
            // case "shutdown/ready":
            default: this.unimp(msg.command); break;
        }
    }

    private unimp(cmd: string) {
        warn(`Unimplemented command '${cmd}'`);
    }

    toString() {
        return `Game { name: "${this.name}", version: "${this.version}"}`;
    }
}
