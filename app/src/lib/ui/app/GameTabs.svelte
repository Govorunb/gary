<script lang="ts">
    import { getRegistry, getUIState } from "$lib/app/utils/di";
    import GameActionList from "./GameActionList.svelte";
    import Tooltip from "../common/Tooltip.svelte";
    import { horizontalScroll } from "$lib/app/utils";
    import GameTooltip from "./GameTooltip.svelte";
    import { InternalWSConnection, GameWSSender } from "$lib/api/ws";
    import { SchemaTestGame } from "$lib/app/schema-test";
    import { boolAttr } from "runed";

    const registry = getRegistry();
    const uiState = getUIState();
    const activeTab = $derived(uiState.activeGameTab);

    async function startSchemaTest() {
        const conn = new InternalWSConnection(`schema-test-${Date.now()}`, "v1");
        const schemaTestGame = new SchemaTestGame(new GameWSSender(conn));
        
        registry.createGame("JSON Schema Test", conn);

        await schemaTestGame.lifecycle();
    }
</script>

<div class="flex h-full flex-col">
    <h2>Connections</h2>
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
                            onclick={() => uiState.activeGameTab = i}
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
        <div class="flex flex-col items-center justify-center w-full flex-1">
            <p class="text-md p-4 text-center text-neutral-600 dark:text-neutral-300">No games connected.</p>
            <button
                class="schema-test-button"
                onclick={startSchemaTest}
            >
                Schema Test
            </button>
        </div>
    {/if}
</div>

<style lang="postcss">
    @reference "global.css";

    h2 {
        @apply self-center;
        @apply text-2xl font-bold text-neutral-800 dark:text-neutral-50;
    }

    .tab-container {
        @apply flex items-end gap-2 overflow-x-scroll;
        @apply border-b border-neutral-200 dark:border-neutral-700;
    }

    .tab-button {
        @apply relative flex items-center gap-2;
        @apply rounded-t-lg border-b-2 px-4 py-2;
        @apply text-sm font-medium transition;

        &:focus-visible {
            @apply outline-none ring-2 ring-sky-400 dark:ring-sky-500;
        }

        &[data-active] {
            @apply border-b-sky-500;
            @apply text-neutral-900 dark:text-neutral-50;
        }

        &:not([data-active]) {
            @apply border-b-transparent;
            @apply text-neutral-500;
            @apply dark:text-neutral-400;

            &:hover {
                @apply border-b-sky-300;
                @apply text-neutral-800;
                @apply dark:text-neutral-200;
            }
        }

        &:not([data-connected]) {
            @apply opacity-60;
        }
    }

    .schema-test-button {
        @apply flex flex-row items-center gap-2;
        @apply rounded-lg;
        @apply bg-sky-600 px-3 py-2;
        @apply text-sm font-medium text-white shadow-sm transition;
        @apply hover:bg-sky-500;
        
        &:focus-visible {
            @apply outline-none;
            @apply ring-2 ring-offset-2;
            @apply ring-sky-400 ring-offset-white dark:ring-offset-neutral-900;
        }
    }
</style>
