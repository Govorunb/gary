<script lang="ts">
    import { getRegistry, getUIState } from "$lib/app/utils/di";
    import GameAction from "./GameAction.svelte";
    import GameMenu from "./GameMenu.svelte";
    import { InternalWSConnection, GameWSSender } from "$lib/api/ws";
    import { SchemaTestGame } from "$lib/app/schema-test";
    import { boolAttr } from "runed";
    import { Plus, ChevronDown, EllipsisVertical } from "@lucide/svelte";
    import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
    import { tick } from "svelte";

    const registry = getRegistry();
    const uiState = getUIState();

    async function startSchemaTest() {
        const conn = new InternalWSConnection(`${Date.now().toString().split("").reverse().join("")}-schema-test`, "v1");
        const schemaTestGame = new SchemaTestGame(new GameWSSender(conn));
        
        registry.createGame("JSON Schema Test", conn);
        await tick();

        await schemaTestGame.lifecycle();
    }
</script>

<div class="flex h-full flex-col">
    <div class="header flex items-center justify-between px-2">
        <h2>Connections</h2>
        <Popover>
            <Popover.Trigger>
                {#snippet element(props)}
                    <button {...props} class="flex flex-row gap-1 items-center">
                        <Plus class="size-6 opacity-80" />
                        <ChevronDown class="size-3 opacity-80" />
                    </button>
                {/snippet}
            </Popover.Trigger>
            <Portal>
                <Popover.Positioner>
                    <Popover.Content>
                        <div class="card flex flex-col gap-2 p-2 bg-surface-200 dark:bg-surface-800 rounded-lg">
                            <button class="schema-test-button" onclick={startSchemaTest}>
                                Schema Test
                            </button>
                        </div>
                    </Popover.Content>
                </Popover.Positioner>
            </Portal>
        </Popover>
    </div>
    
    {#if registry.games.length > 0}
        <div class="games-container">
            {#each registry.games as game (game.conn.id)}
            <!-- {@const activeActions = [...game.actions.values()].filter(a => a.active)} -->
                <details class="game-tab" name="games-accordion">
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
                            <div class="connection-indicator" data-connected={boolAttr(!game.conn.closed)}>
                                <div class="connection-dot"></div>
                            </div>
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
                    </summary>
                    
                    <div class="game-content">
                        <div class="action-list">
                            {#each [...game.actions.values()] as action (action.name)}
                                <GameAction {action} {game} />
                            {/each}
                        </div>
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

    h2 {
        @apply self-center;
        @apply text-2xl font-bold text-neutral-800 dark:text-neutral-50;
    }

    .games-container {
        @apply flex flex-col gap-1 flex-1 overflow-y-hidden;
        @apply px-1 py-2;
    }

    .game-tab {
        @apply rounded-lg border border-neutral-200/70;
        @apply bg-white/80 shadow-sm transition-all;
        @apply dark:border-neutral-700 dark:bg-neutral-900/60;
        
        &[open] {
            @apply border-sky-300 dark:border-sky-600;
            @apply shadow-md flex-1;
        }
        
        &:not([open]):hover {
            @apply bg-neutral-50/80 dark:bg-neutral-800/70;
        }
    }

    .game-tab-header {
        @apply flex cursor-pointer items-center justify-between gap-2;
        @apply px-3 py-2 text-sm font-medium text-neutral-700 transition;
        @apply focus:outline-none;
        &:focus-visible {
            @apply ring-2 ring-sky-400 ring-inset;
        }
        @apply dark:text-neutral-200;
    }

    .game-info {
        @apply flex items-center gap-2 flex-1 min-w-0 text-lg font-medium;
    }

    .game-name {
        @apply truncate;
    }

    .game-controls {
        @apply flex items-center gap-2 shrink-0;
    }

    .connection-indicator {
        @apply flex items-center justify-center;
        
        &[data-connected] .connection-dot {
            @apply bg-green-500;
        }
        
        &:not([data-connected]) .connection-dot {
            @apply bg-red-500;
        }
    }

    .connection-dot {
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
        @apply flex flex-col gap-1;
        @apply flex-1;
        @apply p-2;
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