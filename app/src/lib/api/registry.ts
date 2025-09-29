import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { debug, info, trace, warn } from "@tauri-apps/plugin-log";
import type { GameWSConnection } from "./ws";

type WSConnectionRequest = {
    id: string;
    version: "v1";
} | {
    id: string;
    version: "v2";
    game: string;
};


export class Registry {
    private readonly games = new Map<string, Game>();

    constructor() {
        listen<WSConnectionRequest>('ws-try-connect', (evt) => this.tryConnect(evt.payload));
    }

    async tryConnect(conn: WSConnectionRequest) {
        const channel = new Channel();
        const id = conn.id;
        // approve/deny connection
        if (conn.version == "v1") {
            // can't check game, can't check anything, connection is opaque, front door is ajar
            await invoke('ws-accept', { id, channel } satisfies AcceptArgs);
        } else {
            if (!this.validate_game_name(conn.game))
                await invoke('ws-deny', { id, reason: "Invalid game name" });
            await invoke('ws-accept', { id, channel });
        }
    }

    validate_game_name(name: string): boolean {
        // TODO
        return true;
    }
    // TODO: v1 conn (new game) then v2 conn for same game
    // python version kept games in state for ui, maybe we don't need to
    // (it reset all internals of a game on disconnect anyway)
    // if we have 1 llm instance, we don't need to keep games around (except for seen actions maybe)
}

class Game {
    public readonly actions = new Map<string, Action>();
    // private readonly seenActions = new Set<string>(); // log new actions
    constructor(
        public readonly name: string,
        private readonly conn: GameWSConnection,
    ) {

    }

    public get version() {
        return this.conn.version
    }

    async action_register(actions: Action[]) {
        for (const action of actions) {
            if (this.actions.has(action.name)) {
                // duplicate action conflict resolution
                // v1 drops incoming (ignore new), v2 will drop existing (overwrite with new)
                const isV1 = this.version == "v1";
                const logMethod = isV1 ? warn : info;
                logMethod(`${isV1 ? "Ignoring" : "Overwriting"} duplicate action ${action.name} (on ${this.version} connection)`);
                if (isV1) continue;
            }
            this.actions.set(action.name, action);
        }
    }

    async action_unregister(actions: string[]) {
        for (const action_name of actions) {
            const existed = this.actions.delete(action_name);
            await trace(`Unregistered ${existed ? '' : 'non-'}existing action ${action_name}`);
        }
        info(`Actions unregistered: [${actions}]`);
    }

    async handle(msg: GameMessage) {
        debug(`Handling ${msg.command}`);
    }

    toString() {
        return `Game { name: "${this.name}", version: "${this.version}"}`;
    }
}
