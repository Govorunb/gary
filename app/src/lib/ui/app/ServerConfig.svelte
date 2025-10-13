<script lang="ts">
    import Tooltip from "$lib/ui/common/Tooltip.svelte";
    import { webkitScrollNum } from "$lib/app/utils.svelte";
    import { type ServerManager, SERVER_MANAGER } from "$lib/app/server.svelte";
    import { REGISTRY, type Registry } from "$lib/api/registry.svelte";
    import VersionBadge from "./VersionBadge.svelte";
    import { injectAssert } from "$lib/app/utils/di";

    let manager = injectAssert<ServerManager>(SERVER_MANAGER);
    let registry = injectAssert<Registry>(REGISTRY);
</script>

<div class="col">
    <div class="row">
        <p>Server is {manager.running ? `running on port ${manager.port}` : "stopped"}</p>
    </div>
    <div class="row">
        <label for="port-input">Port</label>
        <input
            id="port-input"
            disabled={manager.running}
            type="number"
            max="65535"
            min="1024"
            {@attach webkitScrollNum}
            placeholder="Port (default 8000)"
            bind:value={manager.port}
        />
    </div>
    {#if manager.connections != null}
        <h3>{manager.connections.length} active connections</h3>
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
