import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as log from "@tauri-apps/plugin-log";
import type { Registry, WSConnectionRequest } from "$lib/api/registry.svelte";
import { clamp } from "./utils.svelte";
import type { Session } from "./session.svelte";
import { UserPrefs } from "./prefs.svelte";
import { toast } from "svelte-sonner";

const STORAGE_KEY = "ws-server:port";
const DEFAULT_PORT = 8000;

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
        void this.initialize();
    }

    async start() {
        try {
            await invoke("start_server", { port: this.userPrefs.serverPort });
        } finally {
            await this.sync();
        }
    }

    async stop() {
        try {
            await invoke("stop_server");
        } finally {
            await this.sync();
        }
    }

    async toggle() {
        if (this.running) {
            await this.stop();
        } else {
            await this.start();
        }
    }

    async sync() {
        try {
            this.connections = await invoke<ServerConnections>("server_state");
        } catch (error) {
            log.error("Failed to sync server state:" + error);
            this.connections = null;
        }
        await this.reconcileConnections();
    }

    dispose() {
        for (const unsub of this.subscriptions) {
            unsub();
        }
        this.subscriptions.length = 0;
    }

    private async initialize() {
        try {
            this.subscriptions.push(await listen<WSConnectionRequest>("ws-try-connect", (evt) => {
                this.registry.tryConnect(evt.payload);
            }));
            this.subscriptions.push(await listen<ServerConnections>("server-state", (evt) => {
                this.connections = evt.payload;
                void this.reconcileConnections();
            }));
        } catch (error) {
            log.error("Failed to subscribe to server-state events:" + error);
        }

        await this.sync();
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
            await invoke("ws_close", { id, code: 1000, reason: "UI out of sync, please reconnect" });
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
}
