<script lang="ts">
    import { type Registry, REGISTRY } from "$lib/api/registry.svelte";
    import { type ServerManager, SERVER_MANAGER } from "$lib/app/server.svelte";
    import { injectAssert } from "$lib/app/utils/di";
    import Tooltip from "../common/Tooltip.svelte";
    import VersionBadge from "./VersionBadge.svelte";

    let registry = injectAssert<Registry>(REGISTRY);
    let manager = injectAssert<ServerManager>(SERVER_MANAGER);
</script>

{#if manager.connections != null}
    <div class="flex-center col">
        <h3>{manager.connections.length} game(s) connected</h3>
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
                                <button onclick={() => game.conn.disconnect()} aria-label="Disconnect" title="Disconnect">x</button>
                            </div>
                        </li>
                    </Tooltip>
                {/each}
            </ul>
        </div>
    </div>
{/if}

<style>
    .flex-center {
        display: flex;
        justify-content: center;
        align-items: center;
    }
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