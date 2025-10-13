<script lang="ts">
    import { injectAssert } from "$lib/app/utils/di";
    import { REGISTRY, type Registry } from "$lib/api/registry.svelte";
    import ActionList from "./ActionList.svelte";
    import Tooltip from "../common/Tooltip.svelte";
    import VersionBadge from "./VersionBadge.svelte";

    let registry = injectAssert<Registry>(REGISTRY);
    let activeTab = $state(0);

</script>

<!-- TODO: limit width (horizontal scroll on the tabs) -->
<div class="game-tabs-container">
    {#if registry.games.length > 0}
        <div class="tabs-header">
            {#each registry.games as game, i (game.conn.id)}
                <!-- TODO: context menu -->
                <!-- TODO: retain UI on disconnect -->
                <Tooltip>
                    {#snippet tip()}
                        <div class="row">
                            <p>ID: <b>{game.conn.id}</b></p>
                            <button onclick={() => window.navigator.clipboard.writeText(game.conn.id)}>Copy</button>
                            <button onclick={() => game.conn.disconnect()}>Disconnect</button>
                        </div>
                    {/snippet}
                    <button class:active={activeTab === i} onclick={() => activeTab = i}>
                        <div class="row">
                            <VersionBadge version={game.conn.version} />
                            {game.name}
                        </div>
                    </button>
                </Tooltip>
            {/each}
        </div>
        <div class="tab-content">
            <ActionList game={registry.games[activeTab]} />
        </div>
    {:else}
        <p>No games connected.</p>
    {/if}
</div>

<style>
    .tabs-header {
        display: flex;
        border-bottom: 1px solid light-dark(#ccc, #333);
    }

    button {
        padding: 0.5rem 1rem;
        border: none;
        background-color: transparent;
        cursor: pointer;
        margin-bottom: -1px;
        color: inherit;
    }
    
    .active {
        border-bottom: 2px solid transparent;
        border-bottom-color: var(--accent-color, blue);
    }

    .tab-content {
        padding-top: 1rem;
    }

    .row {
        display: flex;
        align-items: center;
        justify-content: center;
    }
</style>
