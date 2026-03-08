<script lang="ts">
    import { ChevronLeft, ChevronRight } from "@lucide/svelte";
    import type { Snippet } from "svelte";
    import type { DashboardSidebarSide } from "./ui-state.svelte";

    type Props = {
        side: DashboardSidebarSide,
        label: string,
        collapsed: boolean,
        mobileOpen: boolean,
        narrowViewport: boolean,
        content: Snippet,
        rail: Snippet,
        onToggleCollapsed: () => void,
        onOpenMobile: () => void,
        onCloseMobile: () => void,
    };

    let {
        side,
        label,
        collapsed,
        mobileOpen,
        narrowViewport,
        content,
        rail,
        onToggleCollapsed,
        onOpenMobile,
        onCloseMobile,
    }: Props = $props();

    const showingExpanded = $derived(narrowViewport ? mobileOpen : !collapsed);
    const showingRail = $derived(narrowViewport || collapsed);
    const toggleLabel = $derived.by(() => {
        if (narrowViewport) {
            return `${mobileOpen ? "Close" : "Open"} ${label}`;
        }
        return `${collapsed ? "Expand" : "Collapse"} ${label}`;
    });

    function handleToggle() {
        if (narrowViewport) {
            if (mobileOpen) {
                onCloseMobile();
            } else {
                onOpenMobile();
            }
            return;
        }

        onToggleCollapsed();
    }
</script>

<div
    class="dashboard-sidebar"
    data-side={side}
    data-collapsed={collapsed ? "" : undefined}
    data-mobile-open={mobileOpen ? "" : undefined}
    data-narrow={narrowViewport ? "" : undefined}
>
    <aside
        class="sidebar-panel sidebar-expanded"
        data-visible={showingExpanded ? "" : undefined}
        aria-label={`${label} sidebar`}
        aria-hidden={!showingExpanded}
    >
        <div class="sidebar-shell-controls">
            <button
                class="sidebar-toggle"
                type="button"
                onclick={handleToggle}
                title={toggleLabel}
                aria-label={toggleLabel}
                aria-expanded={showingExpanded}
            >
                {#if side === "left"}
                    {#if showingExpanded}
                        <ChevronLeft class="size-4" />
                    {:else}
                        <ChevronRight class="size-4" />
                    {/if}
                {:else}
                    {#if showingExpanded}
                        <ChevronRight class="size-4" />
                    {:else}
                        <ChevronLeft class="size-4" />
                    {/if}
                {/if}
            </button>
        </div>

        <div class="sidebar-content">
            {@render content()}
        </div>
    </aside>

    <div class="sidebar-panel sidebar-rail" data-visible={showingRail ? "" : undefined} aria-hidden={!showingRail}>
        <div class="sidebar-shell-controls">
            <button
                class="sidebar-toggle"
                type="button"
                onclick={handleToggle}
                title={toggleLabel}
                aria-label={toggleLabel}
                aria-expanded={showingExpanded}
            >
                {#if side === "left"}
                    {#if showingExpanded}
                        <ChevronLeft class="size-4" />
                    {:else}
                        <ChevronRight class="size-4" />
                    {/if}
                {:else}
                    {#if showingExpanded}
                        <ChevronRight class="size-4" />
                    {:else}
                        <ChevronLeft class="size-4" />
                    {/if}
                {/if}
            </button>
        </div>

        <div class="sidebar-content">
            {@render rail()}
        </div>
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    .dashboard-sidebar {
        @apply relative min-h-0 overflow-visible;
    }

    .sidebar-panel {
        @apply h-full overflow-visible;
        @apply bg-surface-100/90 shadow-sm ring-1 ring-neutral-200/70;
        @apply dark:bg-surface-900/80 dark:ring-neutral-700/50;
    }

    .sidebar-expanded {
        @apply relative min-h-0;
    }

    .sidebar-rail {
        @apply relative;
    }

    .sidebar-content {
        @apply h-full overflow-hidden;
    }

    .sidebar-rail .sidebar-content {
        @apply w-full;
    }

    .dashboard-sidebar:not([data-narrow]) .sidebar-expanded:not([data-visible]),
    .dashboard-sidebar:not([data-narrow]) .sidebar-rail:not([data-visible]) {
        @apply absolute inset-0;
        pointer-events: none;
        visibility: hidden;
    }

    .sidebar-shell-controls {
        @apply absolute top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity;
    }

    .dashboard-sidebar[data-side="left"] .sidebar-shell-controls {
        @apply right-0 translate-x-1/2;
    }

    .dashboard-sidebar[data-side="right"] .sidebar-shell-controls {
        @apply left-0 -translate-x-1/2;
    }

    .dashboard-sidebar:hover .sidebar-shell-controls,
    .dashboard-sidebar:has(.sidebar-toggle:focus-visible) .sidebar-shell-controls {
        @apply opacity-100;
    }

    .sidebar-toggle {
        @apply inline-flex items-center justify-center rounded-md;
        @apply border border-neutral-200/80 bg-white/95 p-1.5 text-neutral-700 shadow-sm;
        @apply pointer-events-none transition-colors;
        @apply dark:border-neutral-700 dark:bg-surface-800/90 dark:text-neutral-100;

        &:hover {
            @apply bg-neutral-100 dark:bg-surface-700;
        }

        &:focus-visible {
            @apply outline-none ring-2 ring-primary-500;
        }
    }

    .dashboard-sidebar:hover .sidebar-toggle,
    .dashboard-sidebar:has(.sidebar-toggle:focus-visible) .sidebar-toggle {
        @apply pointer-events-auto;
    }

    @media (max-width: 1023px) {
        .dashboard-sidebar {
            @apply min-w-0;
        }

        .dashboard-sidebar .sidebar-shell-controls {
            @apply opacity-100;
        }

        .dashboard-sidebar .sidebar-toggle {
            @apply pointer-events-auto;
        }

        .dashboard-sidebar .sidebar-rail {
            @apply relative;
        }

        .sidebar-expanded {
            @apply absolute inset-y-0;
            @apply layer-mobile-sidebar;
            pointer-events: none;
            visibility: hidden;
            width: min(24rem, calc(100vw - 6rem));
            transition: transform 180ms ease;
        }

        .dashboard-sidebar[data-side="left"] .sidebar-expanded {
            left: 0;
            transform: translateX(-110%);
        }

        .dashboard-sidebar[data-side="right"] .sidebar-expanded {
            right: 0;
            transform: translateX(110%);
        }

        .dashboard-sidebar[data-mobile-open] .sidebar-expanded {
            pointer-events: auto;
            transform: translateX(0);
            visibility: visible;
        }
    }
</style>
