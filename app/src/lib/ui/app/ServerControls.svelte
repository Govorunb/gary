<script lang="ts">
    import Tooltip from "$lib/ui/common/Tooltip.svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { listen } from "@tauri-apps/api/event";
    import { onMount } from "svelte";
    import { throttleClick, scrollNum } from "$lib/app/utils.svelte";
    import type { Registry } from "$lib/api/registry.svelte";

    type Props = {
        port: number;
        registry: Registry;
        // TODO: handlers for state updates
        // e.g.:
        // onServerRunningChange: (running: boolean) => void;
        // onServerConnectionsChange: (connections: string[] | null) => void;
    };
    let {
        port = $bindable(8000),
        registry,
    }: Props = $props();

    let serverConnections: string[] | null = $state(null);
    let serverRunning = $derived(serverConnections != null);

    onMount(async () => {
        await listen<string[]>("server-state", (evt) => {
            serverConnections = evt.payload;
        });
    });

    async function toggleServer() {
        try {
            if (serverRunning) {
                await invoke("stop_server");
                serverRunning = false;
                serverConnections = null;
            } else {
                await invoke("start_server", { port });
                serverRunning = true;
            }
        } catch (error) {
            console.error("Failed to toggle server:", error);
        }
    }
</script>

<div class="server-controls">
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
                                <div class="version-badge {game.conn.version}">
                                    {game.conn.version}
                                </div>
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
    .row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0.5rem 0;
    }

    .version-badge {
        padding: 0.2rem 0.5rem;
        border-radius: 0.5rem;
        font-size: 0.8rem;
        font-weight: bold;
        background-color: var(--color-bg-secondary);
        color: var(--color-text);
    }
</style>
