<script lang="ts">
  import './global.css';

  import { Registry, type WSConnectionRequest } from "$lib/api/registry.svelte";
  import ThemePicker from "$lib/ui/ThemePicker.svelte";
  import Tooltip from "$lib/ui/Tooltip.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { error, warn } from "@tauri-apps/plugin-log";
  import { onDestroy, onMount } from "svelte";
  import { scrollNum } from '$lib/app/utils';

  type ServerConnections = null | string[];

  let port = $state(localStorage.getItem("ws-server:port") ?? 8000);
  let serverActionPending = $state(false);
  let serverConnections: ServerConnections = $state(null);
  let serverRunning = $derived(serverConnections != null);
  let registry = $state(new Registry());
  let subscriptions: Function[] = [];

  async function toggleServer() {
    if (serverActionPending) return;
    try {
      serverActionPending = true;
      if (serverRunning) {
        await invoke("stop_server");
      } else {
        if (typeof port === "string") port = parseInt(port);
        await invoke("start_server", { port });
      }
      setTimeout(() => (serverActionPending = false), 1000);
    } catch (e) {
      error(`${e}`);
      console.error(e);
      serverActionPending = false;
    }
    await sync();
  }
  async function sync() {
    serverConnections = await invoke("server_state");
    if (serverConnections != null) {
      const serverConns = new Set(serverConnections);
      const regConns = new Set(registry.games.map(g => g.conn.id));
      const serverOnly = serverConns.difference(regConns);
      const regOnly = regConns.difference(serverConns);
      for (const id of serverOnly) {
        warn(`Closing server-only connection ${id}`);
        await invoke('ws_close', { id, code: 1000, reason: "UI out of sync, please reconnect" });
      }
      for (const id of regOnly) {
        const game = registry.games.find(g => g.conn.id === id);
        if (game === undefined) {
          error(`registry-only game at ${id} doesn't exist`);
        } else {
          warn(`Closing registry-only connection ${id} (game ${game.name})`);
          registry.games.splice(registry.games.indexOf(game), 1);
          game.conn.close();
        }
      }
    }
  }
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
</script>

<main class="container">
  <h3>Welcome to Gary</h3>
  <div class="row">
    <p>Theme: </p>
    <ThemePicker />
  </div>
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
    <button disabled={serverActionPending} onclick={toggleServer}>
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
                <div class="version-badge {game.conn.version}">{game.conn.version}</div>
                <span>{game.name} ({game.actions.size} actions)</span>
                <!-- TODO: disconnect vs shutdown (& graceful/immediate) -->
                <button onclick={() => registry.getGame(id)?.conn.disconnect()}>x</button>
              </div>
            </li>
          </Tooltip>
        {/each}
      </ul>
    </div>
  {/if}
</main>

<style>

:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;

  color: light-dark(#0f0f0f, #f6f6f6);
  background-color: light-dark(#f6f6f6, #2f2f2f);

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

.container {
  margin: 0;
  padding-top: 10vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}

.row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
}

.version-badge {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0 0.2em 0 0.3em;
  font-size: 0.9em;
  font-weight: 500;
  font-family: inherit;
  box-shadow: 0 2px 2px rgba(0, 0, 0, 0.2);
  &.v1 {
    background-color: light-dark(#396cd8, #4e77d1);
  }
  &.v2 {
    background-color: light-dark(#ff8b00, #f7a644);
  }
}

</style>
