import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as log from "@tauri-apps/plugin-log";
import type { Registry, WSConnectionRequest } from "$lib/api/registry.svelte";
import { readable, type Readable } from "svelte/store";

const STORAGE_KEY = "ws-server:port";
const DEFAULT_PORT = 8000;

type ServerConnections = string[] | null;

export const SERVER_MANAGER_CONTEXT_KEY = "serverManager";

export class ServerManager {
    port: number = $state(readStoredPort());
    connections: ServerConnections = $state(null);
    readonly running: boolean = $derived(this.connections != null);

    private readonly registry: Registry;
    private readonly unsubscribers: UnlistenFn[] = $state([]);
    private readonly subscribers = new Set<(value: ServerManager) => void>();

    constructor(registry: Registry) {
        this.registry = registry;
        $effect(() => {
            localStorage.setItem(STORAGE_KEY, this.port.toString());
        });
        $effect(() => {
            void this.port;
            void this.connections;
            void this.running;
            this.notifySubscribers();
        });
        void this.initialize();
    }

    subscribe(run: (value: ServerManager) => void) {
        this.subscribers.add(run);
        run(this);
        return () => {
            this.subscribers.delete(run);
        };
    }

    async start() {
        try {
            await invoke("start_server", { port: this.port });
        } catch (error) {
            console.error("Failed to start server:", error);
        }
        await this.sync();
    }

    async stop() {
        try {
            await invoke("stop_server");
        } catch (error) {
            console.error("Failed to stop server:", error);
        }
        await this.sync();
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
            console.error("Failed to sync server state:", error);
            this.connections = null;
        }
        await this.reconcileConnections();
    }

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            try {
                unsubscribe();
            } catch (error) {
                console.error("Failed to unsubscribe server manager listener:", error);
            }
        }
        this.unsubscribers.length = 0;
    }

    setPort(port: number) {
        if (!Number.isFinite(port)) return;
        const normalized = Math.trunc(port);
        const clamped = Math.min(65535, Math.max(1024, normalized));
        this.port = clamped;
    }

    private async initialize() {
        try {
            this.unsubscribers.push(await listen<WSConnectionRequest>("ws-try-connect", (event) => {
                this.registry.tryConnect(event.payload);
            }));
            this.unsubscribers.push(await listen<ServerConnections>("server-state", (event) => {
                this.connections = event.payload;
                void this.reconcileConnections();
            }));
        } catch (error) {
            console.error("Failed to subscribe to server-state events:", error);
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
            await invoke("ws_close", { id, code: 1000, reason: "UI out of sync, please reconnect" });
        }

        for (const id of regOnly) {
            const game = this.registry.games.find(g => g.conn.id === id);
            if (game === undefined) {
                log.error(`registry-only game at ${id} doesn't exist`);
            } else {
                log.warn(`Closing registry-only connection ${id} (game ${game.name})`);
                this.registry.games.splice(this.registry.games.indexOf(game), 1);
                game.conn.dispose();
            }
        }
    }

    private notifySubscribers() {
        for (const subscriber of this.subscribers) {
            subscriber(this);
        }
    }
}

export type ServerManagerStore = Readable<ServerManager>;

export const SERVER_MANAGER_STORE_KEY = "serverManagerStore";

export function createServerManagerStore(manager: ServerManager): ServerManagerStore {
    return readable(manager, (set) => {
        const unsubscribe = manager.subscribe(set);
        return () => {
            unsubscribe();
        };
    });
}

function readStoredPort(): number {
    if (typeof localStorage === "undefined") {
        return DEFAULT_PORT;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw == null ? NaN : Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? DEFAULT_PORT : parsed;
}
