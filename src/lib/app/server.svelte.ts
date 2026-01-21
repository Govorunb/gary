import type { UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { settled } from "svelte";
import type { Registry, WSConnectionRequest } from "$lib/api/registry.svelte";
import type { Session } from "./session.svelte";
import type { UserPrefs } from "./prefs.svelte";
import { listenSub, safeInvoke } from "./utils";
import type { EventDef } from "./events";
import { EVENT_BUS } from "./events/bus";
import { TauriServerConnection } from "$lib/api/connection";
import { toast } from "svelte-sonner";

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
        if (isTauri()) {
            listenSub<WSConnectionRequest>("ws-try-connect", (evt) => this.registry.tryConnect(evt.payload), this.subscriptions);
            listenSub<ServerConnections>("server-state", (evt) => this.doSync(evt.payload), this.subscriptions);
            void this.sync();
        } else {
            EVENT_BUS.emit('app/server/no_tauri');
            // we're called before toasts init (so they can't show until settled)
            settled().then(() => toast.warning("No Tauri backend on browser (vite dev)", {description: "Some app features disabled."}));
        }
    }

    async start() {
        return safeInvoke("start_server", { port: this.userPrefs.api.server.port })
            .orTee(e => isTauri() && toast.error(`Failed to start server`, { description: e }))
            .finally(() => this.sync());
        }
        
        async stop() {
            return safeInvoke("stop_server")
            .orTee(e => isTauri() && toast.error(`Failed to stop server`, { description: e }))
            .finally(() => this.sync());
    }

    async toggle() {
        return this.running ? this.stop() : this.start();
    }

    async sync() {
        const conns = await safeInvoke<ServerConnections>("server_state")
            .orTee(e => isTauri() && toast.error(`Failed to sync server state`, { description: e }))
            .unwrapOr(null);
        this.doSync(conns);
    }

    private doSync(conns: ServerConnections) {
        this.connections = conns;
        void this.reconcileConnections();
    }

    private async reconcileConnections() {
        if (this.connections == null) {
            const wsGames = this.registry.games.filter(g => g.conn instanceof TauriServerConnection);
            
            toast.warning("Server stopped, disconnecting games");
            
            for (const game of wsGames) {
                this.registry.removeGame(game.id);
                game.conn.dispose();
            }
            EVENT_BUS.emit('app/server/stopped', { disconnectedGames: wsGames.map(g => ({id: g.id, name: g.name}))});
            return;
        }

        const serverConns = new Set(this.connections);
        const regConns = new Set(this.registry.games.map(game => game.conn.id));
        const serverOnly = Array.from(serverConns.difference(regConns));
        const regOnly = Iterator.from(regConns.difference(serverConns))
            .map(c => this.registry.getGame(c)!)
            // only tauri conns (internal e.g. schema-test are fine)
            .filter(g => g.conn instanceof TauriServerConnection)
            .toArray();

        EVENT_BUS.emit('app/server/reconcile', { serverOnly, regOnly: regOnly.map(g => g.conn.id) });

        for (const id of serverOnly) {
            await safeInvoke("ws_close", { id, code: 1000, reason: "UI out of sync, please reconnect" });
        }

        for (const game of regOnly) {
            this.registry.removeGame(game.conn.id);
            game.conn.dispose();
        }
    }

    dispose() {
        // keep running for HMR (reloaded session picks up backend state)
        // if (this.running) void this.stop();
        this.subscriptions.forEach(unsub => unsub());
        this.subscriptions.length = 0;
    }
}

export const EVENTS = [
    { key: 'app/server/no_tauri', },
    {
        key: 'app/server/stopped',
        dataSchema: {} as {disconnectedGames: {id: string, name: string}[]}
    },
    {
        key: 'app/server/reconcile',
        dataSchema: {} as {serverOnly: string[], regOnly: string[]},
    },
] as const satisfies EventDef<'app/server'>[];
