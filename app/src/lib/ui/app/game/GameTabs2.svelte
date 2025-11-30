<script lang="ts">
    import { getRegistry, getUIState } from "$lib/app/utils/di";
    import GameAction from "./GameAction.svelte";
    import GameMenu from "./GameMenu.svelte";
    import { InternalWSConnection, GameWSSender } from "$lib/api/ws";
    import { SchemaTestGame } from "$lib/app/schema-test";
    import { boolAttr } from "runed";
    import { Plus, ChevronDown, EllipsisVertical } from "@lucide/svelte";
    import Popover from "$lib/ui/common/Popover.svelte";
    import { tick } from "svelte";

    const registry = getRegistry();
    const uiState = getUIState();
    const selectedTab = $derived(uiState.selectedGameTab);

    async function startSchemaTest() {
        const conn = new InternalWSConnection(`${Date.now().toString().split("").reverse().join("")}-schema-test`, "v1");
        const schemaTestGame = new SchemaTestGame(new GameWSSender(conn));

        registry.createGame("JSON Schema Test", conn);
        await tick();

        await schemaTestGame.lifecycle();
    }
</script>

<div class="flex h-full flex-col">
    <div class="header">
        <h2>Connections</h2>
        <Popover>
            {#snippet trigger(props)}
                <button {...props} class="flex flex-row gap-1 items-center">
                    <Plus class="size-6 opacity-80" />
                    <ChevronDown class="size-3 opacity-80" />
                </button>
            {/snippet}
            <div class="menu-content">
                <div class="menu-header">Connect Client</div>
                <div class="menu-divider"></div>
                <button class="menu-item" onclick={startSchemaTest}>
                    Schema Test
                </button>
            </div>
        </Popover>
    </div>

    {#if registry.games.length > 0}
        <div class="games-container">
            {#each registry.games as game, i (game.conn.id)}
                {@const seenActions = [...game.actions.values()]}
                {@const activeActions = seenActions.filter(a => a.active)}
                <details class="game-tab" name="games-accordion"
                    open={selectedTab === i}
                >
                    <summary class="game-tab-header">
                        <div class="game-info">
                            <span class="game-name">{game.name}</span>
                        </div>
                        <div class="game-controls">
                            <!-- {#if activeActions.length > 0}
                                <span class="note" title="{activeActions.length} active actions">
                                    {activeActions.length}
                                </span>
                            {/if} -->
                            <div class="status-indicator"
                                data-connected={boolAttr(!game.conn.closed)}
                                data-warn={boolAttr(false /* todo */)}
                                data-error={boolAttr(false /* todo */)}
                            >
                                <div class="status-dot"></div>
                            </div>
                            <Popover>
                                {#snippet trigger(props)}
                                    <button {...props} class="menu-trigger">
                                        <EllipsisVertical />
                                    </button>
                                {/snippet}
                                <GameMenu {game} />
                            </Popover>
                        </div>
                    </summary>

                    <div class="game-content action-list">
                        {#each activeActions as action (action.name)}
                            <GameAction {action} {game} />
                        {/each}
                    </div>
                </details>
            {/each}
        </div>
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

    .header {
        @apply flex items-center justify-between;
        @apply px-2;
    }

    h2 {
        @apply self-center;
        @apply text-2xl font-bold text-neutral-800 dark:text-neutral-50;
        @apply select-none;
    }

    .games-container {
        @apply flex flex-col gap-1 flex-1 overflow-y-hidden;
        @apply px-1 py-2;
    }

    details.game-tab {
        @apply flex flex-col overflow-y-hidden;
        @apply rounded-lg shadow-sm transition-all;
        @apply border border-neutral-200/70 dark:border-neutral-700;
        @apply bg-white/80 dark:bg-neutral-900/60;

        &[open] {
            @apply border-sky-300 dark:border-sky-600;
            @apply shadow-md flex-1;
        }

        &:not([open]):hover {
            @apply bg-neutral-50/80 dark:bg-neutral-800/70;
        }

        summary.game-tab-header {
            @apply flex cursor-pointer items-center justify-between gap-2;
            @apply px-3 py-2 text-sm font-medium text-neutral-700 transition;
            @apply focus:outline-none;
            &:focus-visible {
                @apply ring-2 ring-sky-400 ring-inset;
            }
            @apply dark:text-neutral-200;
        }

        /* whoever decided not to make this pseudoelement a header in the docs - dishonor upon your family */
        &::details-content {
            @apply overflow-y-scroll;
        }
    }

    .game-info {
        @apply flex items-center gap-2 flex-1 min-w-0 text-lg font-medium;
    }

    .game-name {
        @apply truncate max-w-[calc(100%-1rem)];
    }

    .game-controls {
        @apply flex items-center gap-2 shrink-0;
    }

    .status-indicator {
        @apply flex items-center justify-center;

        &[data-connected] .status-dot {
            @apply bg-green-500;
        }

        &[data-warn] .status-dot {
            @apply bg-warning-500;
        }

        &[data-error] .status-dot {
            @apply bg-red-500;
        }
    }

    .status-dot {
        @apply w-2 h-2 rounded-full;
        @apply transition-colors;
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

    .game-content {
        @apply border-t border-neutral-200/50 dark:border-neutral-700/50;
    }

    .action-list {
        @apply flex flex-col gap-1 p-2;
    }

    .menu-content {
        @apply flex flex-col gap-1 px-1 py-1;
        @apply bg-surface-200-800 rounded-md;
        @apply border border-neutral-900/30;
        @apply min-w-48;
    }

    .menu-header {
        @apply px-3 py-2;
        @apply font-bold;
        @apply text-neutral-900 dark:text-neutral-50;
        @apply select-none;
    }

    .menu-divider {
        @apply mx-2 h-px;
        @apply bg-neutral-200 dark:bg-neutral-700;
    }

    .menu-item {
        @apply flex flex-row gap-1.5 items-center;
        @apply w-full px-3 py-2;
        @apply rounded-sm;
        @apply text-left text-sm;
        @apply text-neutral-700 dark:text-neutral-300;
        @apply transition-colors duration-150;
        &:hover {
            @apply bg-neutral-200/70 dark:bg-neutral-700/70;
        }
        &:focus-visible {
            @apply outline-none ring-1 ring-neutral-400 dark:ring-neutral-600;
        }
    }

    .menu-item-primary {
        @apply text-primary-600 dark:text-primary-400;
        &:hover {
            @apply bg-primary-100/50 dark:bg-primary-900/30;
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
