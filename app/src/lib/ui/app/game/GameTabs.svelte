<script lang="ts">
    import { getRegistry, getUIState } from "$lib/app/utils/di";
    import GameActionList from "./GameActionList.svelte";
    import { horizontalScroll, tooltip } from "$lib/app/utils";
    import GameMenu from "./GameMenu.svelte";
    import { InternalWSConnection, GameWSSender } from "$lib/api/ws";
    import { SchemaTestGame } from "$lib/app/schema-test";
    import { boolAttr } from "runed";
    import { CirclePlus, EllipsisVertical } from "@lucide/svelte";
    import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
    import { tick } from "svelte";

    const registry = getRegistry();
    const uiState = getUIState();
    const selectedTab = $derived(uiState.selectedGameTab);

    async function startSchemaTest() {
        const conn = new InternalWSConnection(`schema-test-${Date.now()}`, "v1");
        const schemaTestGame = new SchemaTestGame(new GameWSSender(conn));
        
        registry.createGame("JSON Schema Test", conn);
        await tick();
        uiState.selectedGameTab = registry.games.length - 1;

        await schemaTestGame.lifecycle();
    }
</script>

<div class="flex h-full flex-col">
    <div class="header flex items-center justify-around">
        <h2 class="flex flex-row gap-2">
            Connections
            <button onclick={startSchemaTest} {@attach tooltip("Start Schema Test")}>
                <CirclePlus class="size-6 stroke-primary-400/80" />
            </button>
        </h2>
    </div>
    {#if registry.games.length > 0}
        <div class="tab-container"
            {@attach horizontalScroll}
        >
            {#each registry.games as game, i (game.conn.id)}
                <!-- TODO: context menu -->
                <!-- TODO: retain UI on disconnect -->
                <div class="tab-wrapper"
                    data-selected={boolAttr(selectedTab === i)}
                    data-connected={boolAttr(!game.conn.closed)}
                >
                    <button
                        class="tab-button"
                        onclick={() => uiState.selectedGameTab = i}
                    >
                        {game.name}
                    </button>
                    <Popover>
                        <Popover.Trigger>
                            {#snippet element(props)}
                                <button {...props} class="menu-trigger">
                                    <EllipsisVertical />
                                </button>
                            {/snippet}
                        </Popover.Trigger>
                        <Portal>
                            <Popover.Positioner>
                                <Popover.Content>
                                    <GameMenu {game} />
                                </Popover.Content>
                            </Popover.Positioner>
                        </Portal>
                    </Popover>
                </div>
            {/each}
        </div>
        {@const game = registry.games[selectedTab]}
        {#if game}
            <GameActionList {game} />
        {:else}
            Tab {selectedTab} out of bounds bozo
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

    .tab-wrapper {
        @apply relative flex items-center gap-0;
        
        &[data-selected] {
            @apply rounded-md border-2 border-sky-500;
            @apply text-neutral-900 dark:text-neutral-50;
        }

        &:not([data-selected]) {
            @apply border-transparent;
            @apply text-neutral-500;
            @apply dark:text-neutral-400;

            &:hover {
                @apply border-sky-300;
                @apply text-neutral-800;
                @apply dark:text-neutral-200;
            }
        }

        &:not([data-connected]) {
            @apply opacity-60;
        }
        &:focus-visible {
            @apply outline-none ring-2 ring-sky-400 dark:ring-sky-500;
        }
    }

    .tab-button {
        @apply rounded-t-lg px-4 py-2;
        @apply text-sm font-medium transition;
    }

    .menu-trigger {
        @apply p-1 rounded-md;
        @apply text-neutral-500;
        @apply transition-colors;
        &:hover {
            @apply bg-neutral-100;
            @apply dark:bg-neutral-800/50;
            @apply text-neutral-700 dark:text-neutral-300;
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
