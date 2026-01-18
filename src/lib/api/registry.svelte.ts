import { Channel } from "@tauri-apps/api/core";
import r from "$lib/app/utils/reporting";
import { TauriServerConnection, type ServerWSEvent, type AcceptArgs, type BaseConnection } from "./connection";
import * as v1 from "./v1/spec";
import { safeInvoke } from "$lib/app/utils";
import type { Session } from "$lib/app/session.svelte";
import { Game, v1PendingGameName } from "./game.svelte";
import type { EventDef } from "$lib/app/events";

export type WSConnectionRequest = { id: string; } & (
    { version: "v1"; }
    | { version: "v2"; game: string; }
);

export class Registry {
    public games: Game[] = $state([]);

    private readonly session: Session;

    constructor(session: Session) {
        this.session = session;
        this.session.onDispose(() => this.dispose());
        r.info(`Created registry for session '${session.name}' (${session.id})`);
    }

    tryConnect(req: WSConnectionRequest) {
        // approve/deny connection
        switch (req.version) {
            case "v1": break;
            case "v2":
                if (!this.validateGameName(req.game))
                    return this.deny(req, `Invalid game name ${req.game}`);
                break;
            default:
                return this.deny(req, `Invalid version ${(req as any).version}`);
        }
        return this.accept(req);
    }

    async accept(req: WSConnectionRequest) {
        const channel = new Channel<ServerWSEvent>();
        const conn = new TauriServerConnection(req.id, req.version, channel);
        const gameName = req.version === "v1" ? v1PendingGameName(conn.id) : req.game;
        r.debug(`Creating game '${gameName}' (${req.version})`);
        this.createGame(conn);
        await safeInvoke('ws_accept', { id: req.id, channel } satisfies AcceptArgs);
        // TODO: deprecate (compat switch)
        if (conn.version === "v1") {
            r.debug(`${conn.shortId} is v1; sending 'actions/reregister_all' to get game and actions`);
            await conn.send(v1.zReregisterAll.decode({}));
        }
    }

    async deny(req: WSConnectionRequest, reason: string) {
        r.warn("Denied connection request", { details: reason, ctx: { req } });
        await safeInvoke('ws_deny', { id: req.id, reason });
    }

    createGame(conn: BaseConnection, name?: string): Game {
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

export const EVENTS = [
    {
        key: "api/registry/created",
    },
    {
        key: "api/registry/game_created",
    },
    {
        key: "api/registry/v1/reregister_all",
    },
    {
        key: "api/registry/conn_req_denied",
    },
    {
        key: "api/registry/game_removed",
    },
] as const satisfies EventDef<'api/registry'>[];
