<script lang="ts">
    import { injectAssert } from "$lib/app/utils/di";
    import { REGISTRY, type Registry } from "$lib/api/registry.svelte";
    import ActionList from "./ActionList.svelte";
    import VersionBadge from "./VersionBadge.svelte";
    import Tooltip from "../common/Tooltip.svelte";
    import { clamp } from "$lib/app/utils.svelte";
    import GameTooltip from "./GameTooltip.svelte";

    let registry = injectAssert<Registry>(REGISTRY);
    let activeTab = $state(0);

    $effect(() => {
        activeTab = clamp(activeTab, 0, registry.games.length - 1);
    });

</script>

<!-- TODO: limit width (horizontal scroll on the tabs) -->
<div class="game-tabs-container">
    {#if registry.games.length > 0}
        <div class="tabs-header">
            {#each registry.games as game, i (game.conn.id)}
                <!-- TODO: context menu -->
                <!-- TODO: retain UI on disconnect -->
                <Tooltip interactive>
                    {#snippet trigger(attrs)}
                        <button {...attrs} class:active={activeTab === i} class:closed={game.conn.closed} onclick={() => activeTab = i}>
                            <span>{game.name}</span>
                        </button>
                    {/snippet}
                    <GameTooltip {game} />
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

<style lang="postcss">
    .tabs-header {
        display: flex;
        border-bottom: 1px solid light-dark(#ccc, #333);
    }

    button {
        padding: 0.5rem 0.5rem;
        border: none;
        background-color: transparent;
        cursor: pointer;
        margin-bottom: -1px;
        color: inherit;
        height: 100%;
    }
    
    .active {
        border-bottom: 2px solid transparent;
        border-bottom-color: var(--accent-color, blue);
    }

    .closed {
        opacity: 0.5;
    }

    .tab-content {
        padding-top: 1rem;
    }
</style>
