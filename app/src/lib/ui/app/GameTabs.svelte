<script lang="ts">
    import { getRegistry, getSession } from "$lib/app/utils/di";
    import GameActionList from "./GameActionList.svelte";
    import Tooltip from "../common/Tooltip.svelte";
    import { clamp, horizontalScroll } from "$lib/app/utils";
    import GameTooltip from "./GameTooltip.svelte";
    import { InternalWSConnection, GameWSSender } from "$lib/api/ws";
    import { SchemaTestGame } from "$lib/app/schema-test";
    import { boolAttr } from "runed";

    let registry = getRegistry();
    let activeTab = $state(0);

    $effect(() => {
        activeTab = clamp(activeTab, 0, registry.games.length - 1);
    });

    async function startSchemaTest() {
        const conn = new InternalWSConnection(`schema-test-${Date.now()}`, "v1");
        const schemaTestGame = new SchemaTestGame(new GameWSSender(conn));
        
        registry.createGame("JSON Schema Test", conn);

        await schemaTestGame.lifecycle();
    }
</script>

<div class="flex h-full flex-col">
    <h2>Games</h2>
    {#if registry.games.length > 0}
        <div class="tab-container"
            {@attach horizontalScroll}
        >
            {#each registry.games as game, i (game.conn.id)}
                <!-- TODO: context menu -->
                <!-- TODO: retain UI on disconnect -->
                <Tooltip interactive>
                    {#snippet trigger(attrs)}
                        <button
                            {...attrs}
                            data-active={boolAttr(activeTab === i)}
                            data-connected={boolAttr(!game.conn.closed)}
                            class="tab-button"
                            onclick={() => activeTab = i}
                        >
                            <span>{game.name}</span>
                        </button>
                    {/snippet}
                    <GameTooltip {game} />
                </Tooltip>
            {/each}
        </div>
        {@const game = registry.games[activeTab]}
        {#if game}
            <GameActionList {game} />
        {/if}
    {:else}
        <p class="empty-state-text">No games connected.</p>
        <button
            class="schema-test-button"
            onclick={startSchemaTest}
        >
            Schema Test
        </button>
    {/if}
</div>

<style lang="postcss">
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";

    h2 {
        @apply self-center;
        @apply text-2xl font-bold text-neutral-800 dark:text-neutral-50;
    }

    .tab-container {
        @apply flex items-end gap-2 border-b border-neutral-200 dark:border-neutral-700 overflow-x-scroll;
    }

    .tab-button {
        @apply relative flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:focus-visible:ring-sky-500;
    }

    .tab-button {
        @apply relative flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:focus-visible:ring-sky-500;

        &[data-active] {
            @apply border-b-sky-500 text-neutral-900 dark:text-neutral-50;
        }

        &:not([data-active]) {
            @apply border-b-transparent text-neutral-500 hover:border-b-sky-300 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200;
        }

        &:not([data-connected]) {
            @apply opacity-60;
        }
    }

    .empty-state-text {
        @apply text-sm text-neutral-600 dark:text-neutral-300;
    }

    .schema-test-button {
        @apply rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900;
    }
</style>
