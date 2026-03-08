<script lang="ts">
    import ContextLog from "$lib/ui/app/context/ContextLog.svelte";
    import GameTabs from "$lib/ui/app/game/GameTabs.svelte";
    import Workspace from "$lib/ui/app/workspace/Workspace.svelte";
    import { getRegistry, getUIState } from "$lib/app/utils/di";
    import { ChevronLeft, ChevronRight, Menu } from "@lucide/svelte";

    const registry = getRegistry();
    const uiState = getUIState();

    const leftCollapsed = $derived(uiState.isSidebarCollapsed("left"));
    const rightCollapsed = $derived(uiState.isSidebarCollapsed("right"));
    const games = $derived(registry.games);
    const selectedGame = $derived(games[uiState.selectedGameTab] ?? null);

    function toggleLeftSidebar() {
        uiState.toggleSidebar("left");
    }

    function collapseLeftSidebar() {
        uiState.setSidebarCollapsed("left", true);
    }

    function toggleRightSidebar() {
        uiState.toggleSidebar("right");
    }
</script>

<div
    class="dashboard-shell"
    data-left-collapsed={leftCollapsed ? "" : undefined}
    data-right-collapsed={rightCollapsed ? "" : undefined}
>
    {#if leftCollapsed}
        <button
            class="mobile-sidebar-toggle"
            type="button"
            onclick={toggleLeftSidebar}
            title="Open connections"
            aria-label="Open connections"
        >
            <Menu class="size-5" />
        </button>
    {/if}

    <aside
        class="panel left-sidebar"
        data-collapsed={leftCollapsed ? "" : undefined}
        data-mobile-open={!leftCollapsed ? "" : undefined}
        aria-label="Connections sidebar"
    >
        <div class="sidebar-shell-controls">
            <button
                class="sidebar-toggle"
                type="button"
                onclick={toggleLeftSidebar}
                title={leftCollapsed ? "Expand connections" : "Collapse connections"}
                aria-label={leftCollapsed ? "Expand connections" : "Collapse connections"}
                aria-expanded={!leftCollapsed}
            >
                {#if leftCollapsed}
                    <ChevronRight class="size-4" />
                {:else}
                    <ChevronLeft class="size-4" />
                {/if}
            </button>
        </div>

        <div class="left-sidebar-expanded">
            <GameTabs />
        </div>

        <div class="left-sidebar-rail" aria-hidden={!leftCollapsed}>
            <div class="rail-header">
                <span class="rail-title">Games</span>
            </div>

            {#if games.length > 0}
                <div class="rail-game-list">
                    {#each games as game, i (game.conn.id)}
                        <button
                            class="rail-game-button"
                            type="button"
                            data-selected={i === uiState.selectedGameTab ? "" : undefined}
                            onclick={() => uiState.selectGameTab(game.conn.id)}
                            title={game.name}
                            aria-label={`Select ${game.name}`}
                        >
                            {game.name.slice(0, 1).toUpperCase()}
                        </button>
                    {/each}
                </div>
            {:else}
                <div class="rail-empty-state" title="No games connected">0</div>
            {/if}
        </div>
    </aside>

    <button
        class="mobile-sidebar-backdrop"
        type="button"
        data-open={!leftCollapsed ? "" : undefined}
        onclick={collapseLeftSidebar}
        aria-label="Close connections sidebar"
        tabindex={leftCollapsed ? -1 : 0}
    ></button>

    <section class="panel main-panel">
        <ContextLog />
    </section>

    <aside
        class="panel right-sidebar"
        data-collapsed={rightCollapsed ? "" : undefined}
        aria-label="Future dashboard sidebar"
    >
        <div class="sidebar-shell-controls" data-side="right">
            <button
                class="sidebar-toggle"
                type="button"
                onclick={toggleRightSidebar}
                title={rightCollapsed ? "Expand workspace" : "Collapse workspace"}
                aria-label={rightCollapsed ? "Expand workspace" : "Collapse workspace"}
                aria-expanded={!rightCollapsed}
            >
                {#if rightCollapsed}
                    <ChevronLeft class="size-4" />
                {:else}
                    <ChevronRight class="size-4" />
                {/if}
            </button>
        </div>

        <div class="right-sidebar-expanded">
            <Workspace {selectedGame} />
        </div>

        <div class="right-sidebar-rail" aria-hidden={!rightCollapsed}>
            <span class="right-rail-title">Workspace</span>
        </div>
    </aside>
</div>

<style lang="postcss">
    @reference "global.css";

    .dashboard-shell {
        @apply relative grid flex-1 min-h-0 gap-1 p-1;
        grid-template-columns: var(--left-sidebar-width, 20rem) minmax(0, 1fr) var(--right-sidebar-width, 17rem);
    }

    .dashboard-shell[data-left-collapsed] {
        --left-sidebar-width: 4.5rem;
    }

    .dashboard-shell[data-right-collapsed] {
        --right-sidebar-width: 3.5rem;
    }

    .panel {
        @apply fcol-2 h-full overflow-hidden;
        @apply bg-surface-100/90 shadow-sm ring-1 ring-neutral-200/70;
        @apply dark:bg-surface-900/80 dark:ring-neutral-700/50;
    }

    .left-sidebar,
    .right-sidebar {
        @apply relative min-h-0 overflow-visible;
    }

    .main-panel {
        @apply min-w-0;
    }

    .sidebar-shell-controls {
        @apply absolute top-1/2 z-10 -translate-y-1/2;
        @apply opacity-0 transition-opacity;
    }

    .sidebar-shell-controls:not([data-side="right"]) {
        @apply right-0 translate-x-1/2;
    }

    .sidebar-shell-controls[data-side="right"] {
        @apply left-0 -translate-x-1/2;
    }

    .left-sidebar:hover .sidebar-shell-controls,
    .left-sidebar:has(.sidebar-toggle:focus-visible) .sidebar-shell-controls,
    .right-sidebar:hover .sidebar-shell-controls,
    .right-sidebar:has(.sidebar-toggle:focus-visible) .sidebar-shell-controls {
        @apply opacity-100;
    }

    .sidebar-toggle,
    .mobile-sidebar-toggle {
        @apply inline-flex items-center justify-center rounded-md;
        @apply border border-neutral-200/80 bg-white/95 p-1.5 text-neutral-700 shadow-sm;
        @apply transition-colors;
        @apply dark:border-neutral-700 dark:bg-surface-800/90 dark:text-neutral-100;

        &:hover {
            @apply bg-neutral-100 dark:bg-surface-700;
        }

        &:focus-visible {
            @apply outline-none ring-2 ring-primary-500;
        }
    }

    .mobile-sidebar-toggle {
        @apply absolute left-3 top-3 hidden;
        @apply layer-mobile-sidebar-toggle;
    }

    .sidebar-toggle {
        @apply pointer-events-none;
    }

    .left-sidebar:hover .sidebar-toggle,
    .left-sidebar:has(.sidebar-toggle:focus-visible) .sidebar-toggle,
    .right-sidebar:hover .sidebar-toggle,
    .right-sidebar:has(.sidebar-toggle:focus-visible) .sidebar-toggle {
        @apply pointer-events-auto;
    }

    .left-sidebar-expanded,
    .left-sidebar-rail,
    .right-sidebar-expanded,
    .right-sidebar-rail {
        @apply h-full;
    }

    .left-sidebar-expanded {
        @apply min-h-0;
    }

    .left-sidebar[data-collapsed] .left-sidebar-expanded {
        display: none;
    }

    .left-sidebar-rail {
        @apply hidden flex-col items-center gap-2 px-2 pb-2 pt-12;
    }

    .left-sidebar[data-collapsed] .left-sidebar-rail {
        @apply flex;
    }

    .rail-header {
        @apply text-center;
    }

    .rail-title {
        @apply text-xs font-semibold uppercase tracking-[0.2em];
        @apply text-neutral-500 dark:text-neutral-400;
    }

    .rail-game-list {
        @apply fcol-2 items-center w-full;
    }

    .rail-game-button,
    .rail-empty-state {
        @apply flex h-11 w-11 items-center justify-center rounded-xl;
        @apply border border-neutral-200/80 bg-white/80 text-sm font-semibold text-neutral-700;
        @apply transition-colors shadow-sm;
        @apply dark:border-neutral-700 dark:bg-surface-800/80 dark:text-neutral-100;
    }

    .rail-game-button:hover {
        @apply bg-neutral-100 dark:bg-surface-700;
    }

    .rail-game-button[data-selected] {
        @apply border-primary-300 bg-primary-100 text-primary-900;
        @apply dark:border-primary-700 dark:bg-primary-900/50 dark:text-primary-100;
    }

    .mobile-sidebar-backdrop {
        display: none;
    }

    .right-sidebar[data-collapsed] .right-sidebar-expanded {
        display: none;
    }

    .right-sidebar-rail {
        @apply hidden items-center justify-center px-1 py-3;
    }

    .right-sidebar[data-collapsed] .right-sidebar-rail {
        @apply flex;
    }

    .right-rail-title {
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        @apply text-xs font-semibold uppercase tracking-[0.24em];
        @apply text-neutral-500 dark:text-neutral-400;
    }

    @media (max-width: 1023px) {
        .dashboard-shell {
            @apply p-0;
            grid-template-columns: minmax(0, 1fr);
        }

        .dashboard-shell[data-left-collapsed] :global(.context-log-header) {
            @apply pl-10;
        }

        .mobile-sidebar-toggle {
            @apply flex;
        }

        .left-sidebar {
            @apply absolute inset-y-0 left-0;
            @apply layer-mobile-sidebar;
            width: min(24rem, calc(100vw - 3rem));
            transform: translateX(-110%);
            transition: transform 180ms ease;
        }

        .left-sidebar[data-mobile-open] {
            transform: translateX(0);
        }

        .left-sidebar .left-sidebar-expanded {
            display: block;
        }

        .left-sidebar .left-sidebar-rail {
            display: none;
        }

        .mobile-sidebar-backdrop[data-open] {
            @apply absolute inset-0 block bg-neutral-950/35;
            @apply layer-mobile-sidebar-backdrop;
        }

        .right-sidebar {
            display: none;
        }
    }
</style>
