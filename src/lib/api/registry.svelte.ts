import { Channel } from "@tauri-apps/api/core";
import { TauriServerConnection, type ServerWSEvent, type AcceptArgs, type BaseConnection } from "./connection";
import * as v1 from "./v1/spec";
import { safeInvoke } from "$lib/app/utils";
import type { Session } from "$lib/app/session.svelte";
import { Game } from "./game.svelte";
import type { EventDef } from "$lib/app/events";
import { EVENT_BUS } from "$lib/app/events/bus";
import { toast } from "svelte-sonner";

export type WSConnectionRequest = { id: string; } & (
    { version: "v1"; game: undefined; }
    | { version: "v2"; game: string; }
);

export class Registry {
    public games: Game[] = $state([]);

    constructor(private readonly session: Session) {
        this.session.onDispose(() => this.dispose());
        EVENT_BUS.emit('api/registry/created', { session: {id: session.id, name: session.name} });
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
        EVENT_BUS.emit('api/registry/conn_req/accepted', {...req});
        this.createGame(conn, req.game);
        await safeInvoke('ws_accept', { id: req.id, channel } satisfies AcceptArgs);
        // TODO: deprecate (compat switch)
        if (conn.version === "v1") {
            EVENT_BUS.emit('api/registry/v1/reregister_all', {gameId: conn.id});
            await conn.send(v1.zReregisterAll.decode({}));
        }
    }

    async deny(req: WSConnectionRequest, reason: string) {
        EVENT_BUS.emit('api/registry/conn_req/denied', {req, reason});
        toast.warning("Denied connection request", { description: reason });
        await safeInvoke('ws_deny', { id: req.id, reason });
    }

    createGame(conn: BaseConnection, name?: string): Game {
        const game = new Game(this.session, conn, name);
        this.games.push(game);
        conn.onclose(() => {
            EVENT_BUS.emit('api/game/disconnected', { game: { id: game.id, name: game.name }});
            toast.info(`${game.name} disconnected`);
            // TODO: keeping disconnected games in UI (for action list/diagnostics) is undecided
            this.removeGame(game.conn.id);
        });
        return game;
    }

    getGame(idLikeOrPrefix: string) {
        return this.games.find(g =>
            g.conn.id === idLikeOrPrefix
            || g.conn.shortId === idLikeOrPrefix
            || g.conn.id.startsWith(idLikeOrPrefix)
        );
    }

    removeGame(fullId: string) {
        const i = this.games.findIndex(g => g.conn.id === fullId);
        if (i >= 0) {
            this.games.splice(i, 1);
            EVENT_BUS.emit('api/registry/game_removed', {id: fullId});
        }
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
        dataSchema: {} as {session: {id: string, name: string}},
        description: "Created registry",
    },
    {
        key: "api/registry/conn_req/accepted",
        dataSchema: {} as WSConnectionRequest, // matches desired shape
        description: "Accepted connection request",
    },
    {
        key: "api/registry/v1/reregister_all",
        dataSchema: {} as {gameId: string},
        description: "Connection is v1; sending 'actions/reregister_all' to get game and actions",
    },
    {
        key: "api/registry/conn_req/denied",
        dataSchema: {} as {req: WSConnectionRequest, reason: string},
        description: "Denied connection request"
    },
    {
        key: "api/registry/game_removed",
        dataSchema: {} as {id: string},
        description: "Game removed from registry"
    },
] as const satisfies EventDef<'api/registry'>[];
