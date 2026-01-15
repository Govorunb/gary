<script lang="ts">
    import { getRegistry, getUIState } from "$lib/app/utils/di";
    import GameTab from "./GameTab.svelte";
    import { InternalConnection, ConnectionClient } from "$lib/api/connection";
    import { SchemaTestGame } from "$lib/app/schema-test";
    import { DiagnosticsExampleGame } from "$lib/app/diagnostics-example";
    import { Plus, ChevronDown } from "@lucide/svelte";
    import Popover from "$lib/ui/common/Popover.svelte";
    import { tick } from "svelte";

    const registry = getRegistry();
    const uiState = getUIState();
    const selectedTab = $derived(uiState.selectedGameTab);

    async function startSchemaTest() {
        // timestamp reversed to make spotting differences easier (seconds at the start vs middle)
        const conn = new InternalConnection(`${Date.now().toString().reverse()}-schema-test`, "v1");
        const schemaTestGame = new SchemaTestGame(new ConnectionClient(conn));

        registry.createGame(conn);
        await tick();
        await conn.connect();
        await schemaTestGame.lifecycle();
    }

    async function startDiagnosticsExample() {
        const conn = new InternalConnection(`${Date.now().toString().reverse()}-diagnostics-example`, "v1");
        const diagnosticsExampleGame = new DiagnosticsExampleGame(new ConnectionClient(conn));

        registry.createGame(conn);
        await tick();
        await conn.connect();
        await diagnosticsExampleGame.lifecycle();
    }
</script>

<div class="h-full fcol-0 p-4">
    <div class="header">
        <h2>Connections</h2>
        <Popover>
            {#snippet trigger(props)}
                <button {...props} class="frow-1 items-center">
                    <Plus class="size-6 opacity-80" />
                    <ChevronDown class="size-3 opacity-80" />
                </button>
            {/snippet}
            <div class="fcol-0.5">
                <h3 class="pl-2">Connect Client</h3>
                <div class="menu-divider"></div>
                <button class="menu-item" onclick={startSchemaTest}>
                    Schema Test
                </button>
                <button class="menu-item" onclick={startDiagnosticsExample}>
                    Diagnostics Example
                </button>
            </div>
        </Popover>
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

    .games-container {
        @apply fcol-1 flex-1 overflow-y-hidden;
        @apply px-1 py-2;
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
        @apply frow-1.5 items-center;
        @apply w-full px-3 py-2;
        @apply rounded-sm text-sm;
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
