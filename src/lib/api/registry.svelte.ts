import { Channel } from "@tauri-apps/api/core";
import { TauriServerConnection, closedConnection, type ServerWSEvent, type AcceptArgs, type BaseConnection } from "./connection";
import * as v1 from "./v1/spec";
import { safeInvoke, LogLevel } from "#lib/app/utils/index.js";
import type { Session } from "#lib/app/session.svelte.js";
import { Game, v1PendingGameName, zGameRef } from "./game.svelte";
import type { EventDef, EventInstance, Keys, PresentDefs } from "#lib/app/events/index.js";
import z from "zod";
import { EVENT_BUS } from "#lib/app/events/bus.js";
import type { ApiPrefs } from "#lib/app/prefs.svelte.js";

export type WSConnectionRequest = { id: string; } & (
    { version: "v1"; game: undefined; }
    | { version: "v2"; game: string; }
);

export class Registry {
    public games: Game[] = $state([]);
    /** Live connections, held only while the event that creates their game is applied. */
    #connections = new Map<string, BaseConnection>();

    constructor(private readonly session: Session) {
        this.session.onDispose(() => this.dispose());
        this.session.onDispose(session.eventLog.subscribe(REGISTRY_KEYS, ({ event }) => this.apply(event)));
        if (session.live) session.bus.emit('api/registry/created', { session: {id: session.id, name: session.name} });
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
        this.session.bus.emit('api/registry/conn_req/accepted', {...req});
        this.createGame(conn, req.game);
        await safeInvoke('ws_accept', { id: req.id, channel } satisfies AcceptArgs);
        await sendDeprecatedV1ReregisterAllForCompat(conn, this.session.userPrefs.api);
    }

    async deny(req: WSConnectionRequest, reason: string) {
        this.session.bus.emit('api/registry/conn_req/denied', {req, reason});
        await safeInvoke('ws_deny', { id: req.id, reason });
    }

    createGame(conn: BaseConnection, name?: string): Game {
        this.#connections.set(conn.id, conn);
        this.session.bus.emit('api/registry/game_created', {
            game: { id: conn.id, name: name ?? v1PendingGameName(conn.id) },
            version: conn.version,
        });
        this.#connections.delete(conn.id);
        // TODO: keeping disconnected games in UI (for action list/diagnostics) is undecided
        conn.onclose(() => this.removeGame(conn.id));
        return this.getGame(conn.id)!;
    }

    /** Applies game creation and removal. A replayed game has no connection, so it shows as disconnected. */
    private apply(event: EventInstance<typeof REGISTRY_KEYS[number]>) {
        if (event.key === "api/registry/game_created") {
            const { game: { id, name }, version } = event.data;
            this.games.push(new Game(this.session, this.#connections.get(id) ?? closedConnection(id, version), name));
            return;
        }
        const i = this.games.findIndex(g => g.id === event.data.id);
        if (i >= 0) this.games.splice(i, 1)[0].dispose();
    }

    /** Finds a game by its ID, or by a prefix that only one game's ID starts with. */
    getGame(idOrPrefix: string) {
        const exact = this.games.find(g => g.id === idOrPrefix);
        if (exact || !idOrPrefix) return exact;
        const matches = this.games.filter(g => g.id.startsWith(idOrPrefix));
        return matches.length === 1 ? matches[0] : undefined;
    }

    removeGame(fullId: string) {
        if (this.games.some(g => g.conn.id === fullId)) {
            this.session.bus.emit('api/registry/game_removed', {id: fullId});
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

export function shouldSendDeprecatedV1ReregisterAll(version: string, apiPrefs: ApiPrefs) {
    return version === "v1" && apiPrefs.compatibility.sendV1ReregisterAll;
}

export const REGISTRY_KEYS = ["api/registry/game_created", "api/registry/game_removed"] as const;

export async function sendDeprecatedV1ReregisterAllForCompat(conn: BaseConnection, apiPrefs: ApiPrefs) {
    if (!shouldSendDeprecatedV1ReregisterAll(conn.version, apiPrefs)) {
        return false;
    }

    EVENT_BUS.emit('api/registry/v1/reregister_all', {gameId: conn.id});
    await conn.send(v1.zReregisterAll.decode({}));
    return true;
}

export const EVENTS = [
    {
        key: "api/registry/created",
        dataSchema: {} as {session: {id: string, name: string}},
        description: "Created registry",
        level: LogLevel.Info,
    },
    {
        key: "api/registry/conn_req/accepted",
        dataSchema: {} as WSConnectionRequest, // matches desired shape
        description: "Accepted connection request",
        level: LogLevel.Debug,
    },
    {
        key: "api/registry/v1/reregister_all",
        dataSchema: {} as {gameId: string},
        description: "Connection is v1; sending 'actions/reregister_all' to get game and actions",
        level: LogLevel.Debug,
    },
    {
        key: "api/registry/conn_req/denied",
        dataSchema: {} as {req: WSConnectionRequest, reason: string},
        description: "Denied connection request",
        level: LogLevel.Warning,
    },
    {
        key: "api/registry/game_created",
        dataSchema: z.strictObject({ game: zGameRef, version: z.string() }),
        description: "Game added to registry",
        level: LogLevel.Debug,
    },
    {
        key: "api/registry/game_removed",
        dataSchema: z.strictObject({ id: z.string() }),
        description: "Game removed from registry",
        level: LogLevel.Info,
    },
] as const satisfies EventDef<'api/registry'>[];

export const DISPLAY = {
    "api/registry/conn_req/denied": ({ reason }) => ({
        title: "Denied connection request",
        description: reason,
    }),
} as PresentDefs<Keys<typeof EVENTS>>;
