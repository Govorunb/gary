<script lang="ts">
    import { EllipsisVertical, Filter } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import type { Game } from "$lib/api/game.svelte";
    import { EVENTS_BY_KEY, redactSensitiveData, type EventDef, type EventInstance, type EventKey } from "$lib/app/events";
    import { LogLevel } from "$lib/app/utils";
    import { getSession, getUIState } from "$lib/app/utils/di";
    import { eventLevel } from "$lib/app/events";
    import { filterEvents } from "./event-filter";
    import Popover from "$lib/ui/common/Popover.svelte";
    import VirtualLog from "$lib/ui/common/VirtualLog.svelte";
    import EventLogRow from "./EventLogRow.svelte";

    type Props = {
        selectedGame: Game | null;
    };

    let { selectedGame }: Props = $props();

    const session = getSession();
    const uiState = getUIState();
    const filter = $derived(uiState.eventLogFilter);

    let menuOpen = $state(false);
    let log = $state<VirtualLog<EventInstance<EventKey>>>();
    // Scroll to the event a rail glyph was clicked on, once the log is on screen.
    $effect(() => {
        const target = uiState.eventLogScrollTarget;
        if (!target || !log) return;
        const index = visibleEvents.findIndex((event) => event.id === target);
        uiState.eventLogScrollTarget = null;
        if (index !== -1) log.scrollToIndex(index);
    });
    let clock = $state(Date.now());
    let clockInterval: ReturnType<typeof setInterval> | null = null;

    const minimumLevelOptions = [
        LogLevel.Verbose,
        LogLevel.Debug,
        LogLevel.Info,
        LogLevel.Warning,
        LogLevel.Error,
    ] as const;

    const displayedEvents = $derived(session.eventLog.displayed);
    const visibleEvents = $derived(filterEvents(displayedEvents, filter, selectedGame));
    const totalEvents = $derived(displayedEvents.length);
    const filterLabel = $derived(`${filter.selectedOnly ? "Game" : "All"} ${LogLevel[filter.minimumLevel]}+`);
    // Warning light for the column header: how many warning-or-worse events are in the log.
    const attention = $derived.by(() => {
        let warn = 0;
        let err = 0;
        for (const event of displayedEvents) {
            const level = eventLevel(event);
            if (level >= LogLevel.Error) err++;
            else if (level >= LogLevel.Warning) warn++;
        }
        return { warn, err };
    });
    const emptyText = $derived.by(() => {
        if (totalEvents === 0) return "No events yet.";
        if (filter.selectedOnly && !selectedGame) return "Select a game to use selected-game filtering.";
        return "No events match these filters.";
    });
    const selectedScopeLabel = $derived(selectedGame ? selectedGame.name : "No game selected");

    $effect(() => {
        clockInterval ??= setInterval(() => {
            clock = Date.now();
        }, 5_000);

        return () => {
            if (!clockInterval) return;
            clearInterval(clockInterval);
            clockInterval = null;
        };
    });

    function closeMenu() {
        menuOpen = false;
    }

    function clearDisplayedEvents() {
        session.eventLog.clearDisplayed();
        closeMenu();
    }

    async function copyVisibleEventsJson() {
        const events = visibleEvents.map((event) => ({
            ...event,
            data: redactSensitiveData((EVENTS_BY_KEY[event.key] as EventDef).dataSchema, event.data),
        }));

        try {
            await navigator.clipboard.writeText(JSON.stringify(events, eventJsonReplacer, 2));
            toast.success("Copied JSON to clipboard");
        } catch (error) {
            toast.error("Failed to copy JSON", {
                description: error instanceof Error ? error.message : String(error),
            });
        } finally {
            closeMenu();
        }
    }

    function eventJsonReplacer(_key: string, value: unknown) {
        if (value instanceof Error) {
            return {
                name: value.name,
                message: value.message,
                stack: value.stack,
            };
        }
        return value;
    }
</script>

<section class="event-log" aria-label="Event log">
    <div class="column-header">
        <span>Events</span>
        {#if attention.err > 0}
            <span class="badge err" title="{attention.err} error(s)">{attention.err}</span>
        {/if}
        {#if attention.warn > 0}
            <span class="badge warn" title="{attention.warn} warning(s)">{attention.warn}</span>
        {/if}
        <span class="spacer"></span>

        <div class="header-actions">
            <Popover>
                {#snippet trigger(props)}
                    <button
                        {...props}
                        class="filter-button"
                        type="button"
                        aria-label="Filter event log"
                        title="Filter event log"
                    >
                        <Filter class="size-3.5" />
                        <span>{filterLabel}</span>
                    </button>
                {/snippet}

                <div class="filter-panel">
                    <div class="filter-group">
                        <p class="filter-heading">Scope</p>
                        <label>
                            <input type="radio" name="event-log-scope" checked={!filter.selectedOnly} onchange={() => filter.selectedOnly = false} />
                            <span>All events</span>
                        </label>
                        <label title={selectedScopeLabel}>
                            <input type="radio" name="event-log-scope" checked={filter.selectedOnly} onchange={() => filter.selectedOnly = true} />
                            <span>Selected game only</span>
                        </label>
                    </div>

                    <div class="filter-group">
                        <p class="filter-heading">Minimum level</p>
                        {#each minimumLevelOptions as level}
                            <label>
                                <input
                                    type="radio"
                                    name="event-log-level"
                                    checked={filter.minimumLevel === level}
                                    onchange={() => filter.minimumLevel = level}
                                />
                                <span>{LogLevel[level]}+</span>
                            </label>
                        {/each}
                    </div>
                </div>
            </Popover>

            <Popover modal open={menuOpen} onOpenChange={(d) => menuOpen = d.open}>
                {#snippet trigger(props)}
                    <button
                        {...props}
                        class="icon-btn"
                        type="button"
                        aria-label="Event log menu"
                        title="Event log menu"
                    >
                        <EllipsisVertical />
                    </button>
                {/snippet}

                <button class="menu-item" type="button" onclick={copyVisibleEventsJson}>
                    Copy JSON
                </button>
                <button class="menu-item menu-item-danger" type="button" onclick={clearDisplayedEvents}>
                    Clear Event Log
                </button>
            </Popover>
        </div>
    </div>

    <VirtualLog
        bind:this={log}
        class="event-feed"
        items={visibleEvents}
        getKey={(event) => event.id}
        estimateSize={44}
        overscan={12}
        gap={2}
    >
        {#snippet children(event)}
            <EventLogRow {event} {clock} />
        {/snippet}

        {#snippet empty()}
            <div class="empty-state">
                <p>{emptyText}</p>
            </div>
        {/snippet}
    </VirtualLog>
</section>

<style lang="postcss">
    @reference "global.css";

    .event-log {
        @apply fcol-0 h-full min-h-0;
    }
    .column-header {
        @apply pr-2;
    }
    .header-actions {
        @apply frow-1 shrink-0 items-center;
    }
    .filter-button {
        @apply frow-1.5 shrink-0 items-center h-7 px-2 rounded-md;
        @apply text-xs font-medium text-ink-2 transition-colors;
        &:hover {
            @apply bg-layer-3 text-ink-0;
        }
        &:focus-visible {
            @apply outline-none ring-2 ring-accent;
        }
    }
    .filter-panel {
        @apply fcol-3 w-56 p-1;
    }
    .filter-group {
        @apply fcol-1;
    }
    .filter-heading {
        @apply px-2 text-xs font-semibold text-ink-2;
    }
    .filter-group label {
        @apply frow-2 cursor-pointer items-center rounded-md px-2 py-1.5 text-sm;
        @apply text-ink-1 transition-colors;
        &:hover {
            @apply bg-layer-4;
        }
        &:has(input:focus-visible) {
            @apply ring-2 ring-accent;
        }
        & input {
            @apply size-3.5 accent-accent;
        }
    }
    .event-feed {
        @apply min-h-0 flex-1 px-2 pb-2;
    }
    .empty-state {
        @apply fcol-2 min-h-32 items-center justify-center rounded-lg border border-dashed;
        @apply border-edge px-3 text-center text-sm text-ink-2;
    }
</style>
