<script lang="ts">
    import { getRegistry, getUIState } from "$lib/app/utils/di";
    import GameTab from "./GameTab.svelte";
    import { Plus, ChevronDown } from "@lucide/svelte";
    import ConnectClientPopover from "./ConnectClientPopover.svelte";
    import { startSchemaTest } from "./internal-connections";

    const registry = getRegistry();
    const uiState = getUIState();
    const selectedTab = $derived(uiState.selectedGameTab);
</script>

<div class="game-tabs-shell">
    <div class="header">
        <h2>Connections</h2>
        <ConnectClientPopover>
            {#snippet trigger(props)}
                <button {...props} class="frow-1 items-center">
                    <Plus class="size-6 opacity-80" />
                    <ChevronDown class="size-3 opacity-80" />
                </button>
            {/snippet}
        </ConnectClientPopover>
    </div>

    {#if registry.games.length > 0}
        <div class="games-container">
            {#each registry.games as game, i (game.conn.id)}
                <GameTab {game} isSelected={selectedTab === i} />
            {/each}
        </div>
    {:else}
        <div class="fcol-0 items-center justify-center w-full flex-1">
            <p class="text-md p-4 text-center text-neutral-600 dark:text-neutral-300">No games connected.</p>
            <button
                class="schema-test-button"
                onclick={() => startSchemaTest(registry)}
            >
                Schema Test
            </button>
        </div>
    {/if}
</div>

<style lang="postcss">
    @reference "global.css";

    .game-tabs-shell {
        @apply h-full fcol-0 p-2;
    }

    .header {
        @apply flex items-center justify-between;
        @apply px-1;
    }

    .games-container {
        @apply fcol-1 flex-1 overflow-y-hidden;
        @apply px-0.5 py-1;
    }

    .schema-test-button {
        @apply frow-2 items-center;
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
