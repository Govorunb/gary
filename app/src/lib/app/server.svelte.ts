import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as log from "@tauri-apps/plugin-log";
import type { Registry, WSConnectionRequest } from "$lib/api/registry.svelte";
import type { Session } from "./session.svelte";
import { UserPrefs } from "./prefs.svelte";
import { toast } from "svelte-sonner";
import { safeInvoke } from "./utils";

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
        // these can't(?) fail
        listen<WSConnectionRequest>("ws-try-connect", (evt) => {
            this.registry.tryConnect(evt.payload);
        }).then(unsub => this.subscriptions.push(unsub));
        listen<ServerConnections>("server-state", (evt) => {
            this.connections = evt.payload;
            void this.reconcileConnections();
        }).then(unsub => this.subscriptions.push(unsub));
        void this.sync();
    }

    async start() {
        return safeInvoke("start_server", { port: this.userPrefs.server.port })
            .orTee(e => log.error(`Failed to start server: ${e}`))
            .finally(() => this.sync());
    }

    async stop() {
        return safeInvoke("stop_server")
            .orTee(e => log.error(`Failed to stop server: ${e}`))
            .finally(() => this.sync());
    }

    async toggle() {
        return this.running ? this.stop() : this.start();
    }

    async sync() {
        this.connections = await safeInvoke<ServerConnections>("server_state")
            .orTee(e => log.error(`Failed to sync server state: ${e}`))
            .unwrapOr(null);
        await this.reconcileConnections();
    }

    private async reconcileConnections() {
        if (this.connections == null) {
            if (this.registry.games.length > 0) {
                log.warn("Server stopped, removing all games");
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
            log.warn(`Closing server-only connection ${id}`);
            toast.warning(`Closing server-only connection`, {
                description: `ID: ${id}`,
            });
            await safeInvoke("ws_close", { id, code: 1000, reason: "UI out of sync, please reconnect" });
        }

        for (const id of regOnly) {
            const game = this.registry.games.find(g => g.conn.id === id);
            if (game === undefined) {
                log.error(`registry-only game at ${id} doesn't exist`);
            } else {
                toast.warning(`Closing registry-only connection`, {
                    description: `ID: ${id} (game ${game.name})`,
                });
                log.warn(`Closing registry-only connection ${id} (game ${game.name})`);
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
