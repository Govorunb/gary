<script lang="ts">
    import Tooltip from "$lib/ui/common/Tooltip.svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { listen } from "@tauri-apps/api/event";
    import { getContext, onMount, onDestroy } from "svelte";
    import { throttleClick, scrollNum } from "$lib/app/utils.svelte";
    import * as log from "@tauri-apps/plugin-log";
    import type { Registry, WSConnectionRequest } from "$lib/api/registry.svelte";
    import VersionBadge from "./VersionBadge.svelte";

    type Props = {
        port: number;
        // TODO: handlers for state updates
        // e.g.:
        // onServerRunningChange: (running: boolean) => void;
        // onServerConnectionsChange: (connections: string[] | null) => void;
    };
    let {
        port = $bindable(8000),
    }: Props = $props();

    let serverConnections: string[] | null = $state(null);
    let serverRunning = $derived(serverConnections != null);
    let registry = getContext<Registry>("registry");

    let subscriptions: Function[] = [];

    onMount(async () => {
        // unmounted on HMR
        subscriptions.push(await listen<WSConnectionRequest>("ws-try-connect", (evt) => {
            registry.tryConnect(evt.payload);
            console.log(registry);
        }));
        subscriptions.push(await listen<string[]>("server-state", (evt) => serverConnections = evt.payload));
        await sync();
    });
    onDestroy(async () => {
        for (const unsub of subscriptions) {
          await unsub();
        }
    });

    $effect(() => {
        localStorage.setItem("ws-server:port", port.toString());
    })

    async function toggleServer() {
        try {
            if (serverRunning) {
                await invoke("stop_server");
                serverConnections = null;
            } else {
                await invoke("start_server", { port });
            }
        } catch (error) {
            console.error("Failed to toggle server:", error);
        }
        await sync();
    }
    async function sync() {
        serverConnections = await invoke("server_state");
        if (serverConnections == null) {
            if (registry.games.length > 0) {
                log.warn("Server stopped, closing all connections");
                for (const game of registry.games) {
                    game.conn.close();
                }
                registry.games.length = 0;
            }
            return;
        }
        const serverConns = new Set(serverConnections);
        const regConns = new Set(registry.games.map(g => g.conn.id));
        const serverOnly = serverConns.difference(regConns);
        const regOnly = regConns.difference(serverConns);
        for (const id of serverOnly) {
            log.warn(`Closing server-only connection ${id}`);
            await invoke('ws_close', { id, code: 1000, reason: "UI out of sync, please reconnect" });
        }
        for (const id of regOnly) {
            const game = registry.games.find(g => g.conn.id === id);
            if (game === undefined) {
                log.error(`registry-only game at ${id} doesn't exist`);
            } else {
                log.warn(`Closing registry-only connection ${id} (game ${game.name})`);
                registry.games.splice(registry.games.indexOf(game), 1);
                game.conn.close();
            }
        }
    }

</script>

<div class="col">
    <div class="row">
        <p>Server is {serverRunning ? `running on port ${port}` : "stopped"}</p>
    </div>
    <div class="row">
        <label for="port-input">Port</label>
        <input
            id="port-input"
            disabled={serverRunning}
            type="number"
            max="65535"
            min="1024"
            {@attach scrollNum}
            placeholder="Port (default 8000)"
            bind:value={port}
        />
        <button {@attach throttleClick(500, toggleServer)}>
            {serverRunning ? "Stop" : "Start"}
        </button>
    </div>
    {#if serverConnections != null}
        <h3>{serverConnections.length} active connections</h3>
        <div class="row">
            <ul>
                {#each registry.games as game (game.conn.id)}
                    {@const id = game.conn.id}
                    <Tooltip>
                        {#snippet tip()}
                            <div class="row">
                                <p>ID: <b>{id}</b></p>
                                <button onclick={() => window.navigator.clipboard.writeText(id)}>Copy</button>
                            </div>
                        {/snippet}
                        <li>
                            <div class="row">
                                <VersionBadge version={game.conn.version} />
                                <span>{game.name} ({game.actions.size} actions)</span>
                            </div>
                        </li>
                    </Tooltip>
                {/each}
            </ul>
        </div>
    {/if}
</div>

<style>
    .col {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }
    .row {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 15px;
    }
</style>
