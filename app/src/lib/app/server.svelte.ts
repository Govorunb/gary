import type { UnlistenFn } from "@tauri-apps/api/event";
import r from "$lib/app/utils/reporting";
import type { Registry, WSConnectionRequest } from "$lib/api/registry.svelte";
import type { Session } from "./session.svelte";
import type { UserPrefs } from "./prefs.svelte";
import { hasTauri, listenSub, safeInvoke } from "./utils";
import { settled } from "svelte";

type ServerConnections = string[] | null;

export class ServerManager {
    connections: ServerConnections = $state(null);
    readonly running: boolean = $derived(this.connections != null);

    private readonly session: Session;
    private readonly registry: Registry;
    private readonly subscriptions: UnlistenFn[] = $state([]);
    private readonly userPrefs: UserPrefs;

    constructor(session: Session, userPrefs: UserPrefs) {
        this.session = session;
        void this.session.onDispose(() => this.dispose());
        this.registry = session.registry;
        this.userPrefs = userPrefs;
        if (hasTauri()) {
            listenSub<WSConnectionRequest>("ws-try-connect", (evt) => this.registry.tryConnect(evt.payload), this.subscriptions);
            listenSub<ServerConnections>("server-state", (evt) => this.doSync(evt.payload), this.subscriptions);
            void this.sync();
        } else {
            // we're called before toasts init (so they can't show)
            settled().then(() => r.warn("Tauri backend not available", "Server will not work"));
        }
    }

    async start() {
        return safeInvoke("start_server", { port: this.userPrefs.server.port })
            // .orTee(e => r.error(`Failed to start server`, `${e}`))
            .finally(() => this.sync());
    }

    async stop() {
        return safeInvoke("stop_server")
            // .orTee(e => r.error(`Failed to stop server`, `${e}`))
            .finally(() => this.sync());
    }

    async toggle() {
        return this.running ? this.stop() : this.start();
    }

    async sync() {
        const conns = await safeInvoke<ServerConnections>("server_state")
            // .orTee(e => r.error(`Failed to sync server state`, `${e}`))
            .unwrapOr(null);
        this.doSync(conns);
    }

    private doSync(conns: ServerConnections) {
        this.connections = conns;
        void this.reconcileConnections();
    }

    private async reconcileConnections() {
        if (this.connections == null) {
            if (this.registry.games.length > 0) {
                r.warn("Server stopped, removing all games");
                for (const game of this.registry.games) {
                    game.conn.dispose();
                }
                this.registry.games.length = 0;
            }
            return;
        }

        const serverConns = new Set(this.connections);
        const regConns = new Set(this.registry.games.map(game => game.conn.id));
        const serverOnly = serverConns.difference(regConns);
        const regOnly = regConns.difference(serverConns);

        for (const id of serverOnly) {
            r.warn(`Closing server-only connection ${id}`);
            await safeInvoke("ws_close", { id, code: 1000, reason: "UI out of sync, please reconnect" });
        }

        for (const id of regOnly) {
            const game = this.registry.games.find(g => g.conn.id === id);
            if (game === undefined) {
                r.error(`Registry-only connection ${id} doesn't exist`, "???");
            } else {
                r.warn(`Closing registry-only connection`, `ID: ${id} (game ${game.name})`);
                this.registry.games.splice(this.registry.games.indexOf(game), 1);
                game.conn.dispose();
            }
        }
    }

    dispose() {
        // keep running for HMR (reloaded session picks up backend state)
        // if (this.running) void this.stop();
        this.subscriptions.forEach(unsub => unsub());
        this.subscriptions.length = 0;
    }
}
