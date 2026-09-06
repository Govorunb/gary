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
        @apply h-full overflow-visible bg-layer-1;
    }

    .sidebar-expanded {
        @apply relative min-h-0;
    }

    .sidebar-rail {
        @apply relative;
    }

    .dashboard-sidebar[data-side="right"][data-collapsed]:not([data-narrow]) .sidebar-rail::before {
        content: "";
        @apply absolute inset-y-0 right-0;
        width: 1rem;
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
        @apply border border-edge bg-layer-3 p-1 text-ink-1 shadow-sm;
        @apply pointer-events-none transition-colors;

        &:hover {
            @apply bg-layer-4 text-ink-0;
        }

        &:focus-visible {
            @apply outline-none ring-2 ring-accent;
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
            @apply shadow-2xl ring-1 ring-edge;
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
