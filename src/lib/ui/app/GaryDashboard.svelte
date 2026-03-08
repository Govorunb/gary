<script lang="ts">
    import { onMount } from "svelte";
    import DashboardSidebar from "$lib/ui/app/DashboardSidebar.svelte";
    import ContextLog from "$lib/ui/app/context/ContextLog.svelte";
    import GameTabs from "$lib/ui/app/game/GameTabs.svelte";
    import Workspace from "$lib/ui/app/workspace/Workspace.svelte";
    import { getRegistry, getUIState } from "$lib/app/utils/di";

    const registry = getRegistry();
    const uiState = getUIState();

    let isNarrowViewport = $state(false);

    const leftCollapsed = $derived(uiState.isSidebarCollapsed("left"));
    const rightCollapsed = $derived(uiState.isSidebarCollapsed("right"));
    const leftMobileOpen = $derived(uiState.isMobileSidebarOpen("left"));
    const rightMobileOpen = $derived(uiState.isMobileSidebarOpen("right"));
    const anyMobileSidebarOpen = $derived(leftMobileOpen || rightMobileOpen);
    const games = $derived(registry.games);
    const selectedGame = $derived(games[uiState.selectedGameTab] ?? null);

    onMount(() => {
        const mediaQuery = window.matchMedia("(max-width: 1023px)");

        const syncViewport = () => {
            if (isNarrowViewport !== mediaQuery.matches) {
                isNarrowViewport = mediaQuery.matches;
                uiState.closeMobileSidebar();
            }
        };

        syncViewport();
        mediaQuery.addEventListener("change", syncViewport);

        return () => mediaQuery.removeEventListener("change", syncViewport);
    });

    function toggleDesktopSidebar(side: "left" | "right") {
        uiState.toggleSidebar(side);
    }

    function openMobileSidebar(side: "left" | "right") {
        uiState.openMobileSidebar(side);
    }

    function closeMobileSidebar() {
        uiState.closeMobileSidebar();
    }
</script>

<div
    class="dashboard-shell"
    data-left-collapsed={leftCollapsed ? "" : undefined}
    data-right-collapsed={rightCollapsed ? "" : undefined}
>
    {#if isNarrowViewport && anyMobileSidebarOpen}
        <button
            class="mobile-sidebar-backdrop"
            type="button"
            onclick={closeMobileSidebar}
            aria-label="Close sidebar overlay"
        ></button>
    {/if}

    <DashboardSidebar
        side="left"
        label="Connections"
        collapsed={leftCollapsed}
        mobileOpen={leftMobileOpen}
        narrowViewport={isNarrowViewport}
        onToggleCollapsed={() => toggleDesktopSidebar("left")}
        onOpenMobile={() => openMobileSidebar("left")}
        onCloseMobile={closeMobileSidebar}
    >
        {#snippet content()}
            <GameTabs />
        {/snippet}

        {#snippet rail()}
            <div class="left-rail-body">
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
        {/snippet}
    </DashboardSidebar>

    <section class="main-panel">
        <ContextLog />
    </section>

    <DashboardSidebar
        side="right"
        label="Workspace"
        collapsed={rightCollapsed}
        mobileOpen={rightMobileOpen}
        narrowViewport={isNarrowViewport}
        onToggleCollapsed={() => toggleDesktopSidebar("right")}
        onOpenMobile={() => openMobileSidebar("right")}
        onCloseMobile={closeMobileSidebar}
    >
        {#snippet content()}
            <Workspace {selectedGame} />
        {/snippet}

        {#snippet rail()}
            <div class="right-rail-body">
                <span class="right-rail-title">Workspace</span>
            </div>
        {/snippet}
    </DashboardSidebar>
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

    .main-panel {
        @apply min-w-0;
        @apply fcol-2 h-full overflow-hidden;
        @apply bg-surface-100/90 shadow-sm ring-1 ring-neutral-200/70;
        @apply dark:bg-surface-900/80 dark:ring-neutral-700/50;
    }

    .mobile-sidebar-backdrop {
        display: none;
    }

    .left-rail-body,
    .right-rail-body {
        @apply flex h-full w-full px-1 py-3;
    }

    .left-rail-body {
        @apply flex-col items-center justify-start gap-2 px-2 pb-2 pt-12;
    }

    .right-rail-body {
        @apply items-center justify-center;
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

    .right-rail-title {
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        @apply text-xs font-semibold uppercase tracking-[0.24em];
        @apply text-neutral-500 dark:text-neutral-400;
    }

    @media (max-width: 1023px) {
        .dashboard-shell {
            @apply p-0;
            grid-template-columns: 3.75rem minmax(0, 1fr) 3rem;
        }

        .mobile-sidebar-backdrop {
            @apply absolute inset-0 block bg-neutral-950/35;
            @apply layer-mobile-sidebar-backdrop;
        }
    }
</style>
