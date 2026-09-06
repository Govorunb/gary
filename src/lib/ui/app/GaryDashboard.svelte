<script lang="ts">
    import { onMount, tick, untrack } from "svelte";
    import DashboardSidebar from "$lib/ui/app/DashboardSidebar.svelte";
    import ContextLog from "$lib/ui/app/context/ContextLog.svelte";
    import ConnectClientPopover from "$lib/ui/app/game/ConnectClientPopover.svelte";
    import GameTabs from "$lib/ui/app/game/GameTabs.svelte";
    import Workspace from "$lib/ui/app/workspace/Workspace.svelte";
    import { getRegistry, getSession, getUIState } from "$lib/app/utils/di";
    import { Plus, TriangleAlert, CircleX, Check, Info } from "@lucide/svelte";
    import { EVENTS_BY_KEY, EVENTS_DISPLAY, type EventDef, type EventInstance, type EventKey } from "$lib/app/events";
    import { LogLevel, tooltip } from "$lib/app/utils";
    import { eventLevel } from "$lib/app/events";
    import { filterEvents } from "$lib/ui/app/workspace/event-filter";

    const registry = getRegistry();
    const session = getSession();
    const uiState = getUIState();

    const STATUS_COLORS = {
        ok: "var(--color-lvl-ok)",
        warn: "var(--color-lvl-warn)",
        error: "var(--color-lvl-err)",
    } as const;

    function railTitle(event: EventInstance<EventKey>): string {
        const def = EVENTS_BY_KEY[event.key] as EventDef;
        const presenter = EVENTS_DISPLAY[event.key] as ((data: never) => { title?: string }) | undefined;
        try {
            return presenter?.(event.data as never)?.title ?? def.description ?? event.key;
        } catch {
            return def.description ?? event.key;
        }
    }

    let isNarrowViewport = $state(false);

    const leftCollapsed = $derived(uiState.isSidebarCollapsed("left"));
    const rightCollapsed = $derived(uiState.isSidebarCollapsed("right"));
    const leftMobileOpen = $derived(uiState.isMobileSidebarOpen("left"));
    const rightMobileOpen = $derived(uiState.isMobileSidebarOpen("right"));
    const anyMobileSidebarOpen = $derived(leftMobileOpen || rightMobileOpen);
    const games = $derived(registry.games);
    const selectedGame = $derived(games[uiState.selectedGameTab] ?? null);

    // Same events the event log shows under its current filter, same order, for the collapsed rail.
    const railEvents = $derived(
        filterEvents(session.eventLog.displayed, uiState.eventLogFilter, selectedGame)
    );
    // An open log acknowledges incoming events, including ones excluded by the user's filters.
    const eventLogVisible = $derived(isNarrowViewport ? rightMobileOpen : !rightCollapsed);
    $effect(() => {
        const displayedIds = new Set(session.eventLog.displayed.map((event) => event.id));
        const acknowledge = eventLogVisible;
        untrack(() => {
            for (const id of uiState.seenEvents) {
                if (!displayedIds.has(id)) uiState.seenEvents.delete(id);
            }
            if (acknowledge) {
                for (const id of displayedIds) uiState.seenEvents.add(id);
            }
        });
    });
    // The rail follows the newest event like the expanded log does.
    function followNewest(el: HTMLElement) {
        void railEvents.length;
        void tick().then(() => el.scrollTo({ top: el.scrollHeight }));
    }

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
            <div class="rail-body">
                {#each games as game, i (game.conn.id)}
                    <button
                        class="rail-game"
                        type="button"
                        data-selected={i === uiState.selectedGameTab ? "" : undefined}
                        style:--dot={game.conn.closed ? null : STATUS_COLORS[game.status]}
                        onclick={() => uiState.selectGameTab(game.conn.id)}
                        title={game.name}
                        aria-label={`Select ${game.name}`}
                    >
                        {game.name.slice(0, 1).toUpperCase()}
                        <span class="rail-dot"></span>
                    </button>
                {/each}
                <ConnectClientPopover>
                    {#snippet trigger(props)}
                        <button {...props} class="icon-btn" type="button" title="Connect client" aria-label="Connect client">
                            <Plus />
                        </button>
                    {/snippet}
                </ConnectClientPopover>
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
            <div class="rail-body" {@attach followNewest}>
                {#each railEvents as event (event.id)}
                    {const level = eventLevel(event)}
                    <button
                        class="rail-event"
                        type="button"
                        data-level={LogLevel[level].toLowerCase()}
                        data-seen={uiState.seenEvents.has(event.id) ? "" : undefined}
                        onclick={() => uiState.revealEvent(event.id, isNarrowViewport)}
                        {@attach tooltip(railTitle(event))}
                    >
                        {#if level >= LogLevel.Error}
                            <CircleX />
                        {:else if level >= LogLevel.Warning}
                            <TriangleAlert />
                        {:else if level === LogLevel.Success}
                            <Check />
                        {:else}
                            <Info />
                        {/if}
                    </button>
                {/each}
            </div>
        {/snippet}
    </DashboardSidebar>
</div>

<style lang="postcss">
    @reference "global.css";
    .dashboard-shell {
        @apply relative grid flex-1 min-h-0;
        grid-template-columns: var(--left-sidebar-width, 18.75rem) minmax(0, 1fr) var(--right-sidebar-width, 18.75rem);
    }
    .dashboard-shell[data-left-collapsed] {
        --left-sidebar-width: 2.75rem;
    }
    .dashboard-shell[data-right-collapsed] {
        --right-sidebar-width: 2.75rem;
    }
    .main-panel {
        @apply min-w-0 fcol-0 h-full overflow-hidden;
        @apply bg-layer-1 border-x border-edge;
    }
    .mobile-sidebar-backdrop {
        display: none;
    }
    .rail-body {
        @apply fcol-1.5 items-center h-full w-full py-2 overflow-y-auto;
    }
    .rail-game {
        @apply relative flex size-[30px] items-center justify-center rounded-md;
        @apply text-sm font-semibold text-ink-2 transition-colors;
        &:hover { @apply bg-layer-3 text-ink-0; }
        &[data-selected] { @apply bg-layer-3 text-ink-0; }
    }
    .rail-dot {
        @apply absolute top-[3px] right-[3px] size-1.5 rounded-full;
        background-color: var(--dot, var(--color-ink-3));
    }
    .rail-event {
        --lvl: var(--color-ink-3);
        @apply flex size-[30px] shrink-0 items-center justify-center rounded-md transition-colors;
        color: var(--lvl);
        & > :global(svg) { @apply size-[15px]; }
        &[data-level="info"] { --lvl: var(--color-accent); }
        &[data-level="success"] { --lvl: var(--color-lvl-ok); }
        &[data-level="warning"] { --lvl: var(--color-lvl-warn); }
        &[data-level="error"], &[data-level="fatal"] { --lvl: var(--color-lvl-err); }
        /* Unseen glyphs are filled; seen ones fade to an outline. */
        &[data-level="warning"], &[data-level="error"], &[data-level="fatal"] {
            background-color: color-mix(in oklab, var(--lvl) 14%, transparent);
        }
        &[data-seen] { @apply opacity-50; background-color: transparent; }
        &:hover { @apply opacity-100; background-color: color-mix(in oklab, var(--lvl) 22%, transparent); }
    }
    @media (max-width: 1023px) {
        .dashboard-shell {
            grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
        }
        .mobile-sidebar-backdrop {
            @apply absolute inset-0 block bg-black/35;
            @apply layer-mobile-sidebar-backdrop;
        }
    }
</style>
