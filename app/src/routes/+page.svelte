<script lang="ts">
  import { Registry, type WSConnectionRequest } from "$lib/api/registry.svelte";
    import Tooltip from "$lib/ui/Tooltip.svelte";
  import { invoke, Channel } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { error, warn } from "@tauri-apps/plugin-log";
  import { onDestroy, onMount } from "svelte";

  type ServerConnections = null | string[];

  let port = $state(8000); // TODO: config
  let serverActionPending = $state(false);
  let serverConnections: ServerConnections = $state(null);
  let serverRunning = $derived(serverConnections != null);
  let registry = $state(new Registry());
  let subscriptions: Function[] = [];
  $inspect(registry);

  function preventDefault<T, E extends Event>(
    func: (evt: E, ...args: any[]) => T,
  ) {
    return (evt: E, ...args: any[]) => {
      evt.preventDefault();
      return func(evt, ...args);
    };
  }
  async function toggleServer() {
    if (serverActionPending) return;
    try {
      serverActionPending = true;
      if (serverRunning) {
        await invoke("stop_server");
      } else {
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
    console.log(`unsubbing ${subscriptions.length} items`);

    for (const unsub of subscriptions) {
      const buh = unsub();
      if (buh instanceof Promise) {
        await buh;
      }
    }
  });
</script>

<main class="container">
  <h3>Welcome to Gary</h3>
  <div class="row">
    <p>Server is {serverRunning ? `running on port ${port}` : "stopped"}</p>
  </div>
  <div class="row">
    <label for="port-input">Port</label>
    <input
      id="port-input"
      disabled={serverRunning}
      placeholder="Port (default 8000)"
      bind:value={port}
    />
    <button disabled={serverActionPending} onclick={toggleServer}>
      {serverRunning ? "Stop" : "Start"}
    </button>
  </div>
  {#if serverConnections != null}
    <h3>{serverConnections.length} active connections:</h3>
    <div class="row">
      <ul>
        {#each registry.games as game (game.conn.id)}
          {@const id = game.conn.id}
          <Tooltip>
            {#snippet tip()}
              <div class="row">
                <p>id: <b>{id}</b></p>
                <button onclick={() => window.navigator.clipboard.writeText(id)}>Copy</button>
              </div>
            {/snippet}
            <li>
              <div class="row">
                <div class="version-badge {game.conn.version}">{game.conn.version}</div>
                {game.name} ({game.actions.size} actions)
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
  color-scheme: light dark;
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
  transition: border-color 0.25s;
  box-shadow: 0 2px 2px rgba(0, 0, 0, 0.2);
  &.v1 {
    background-color: light-dark(#396cd8, #4e77d1);
  }
  &.v2 {
    background-color: light-dark(#ff8b00, #f7a644);
  }
}

input,
button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  color: light-dark(#0f0f0f, #ffffff);
  background-color: light-dark(#ffffff, #0f0f0f98);
  transition: border-color 0.25s;
  box-shadow: 0 2px 2px rgba(0, 0, 0, 0.2);
  &:disabled {
    background-color: light-dark(#aaaaaa, #0f0f0f30);
    color: light-dark(#aaaaaa, #777777);
  }
}

button {
  cursor: pointer;
}


button:hover:not(:disabled) {
  border-color: #396cd8;
}
button:active:not(:disabled) {
  border-color: #396cd8;
  background-color: light-dark(#e8e8e8, #0f0f0f69);
}

input,
button {
  outline: none;
}

</style>
