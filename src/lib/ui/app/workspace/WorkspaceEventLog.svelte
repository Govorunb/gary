<script lang="ts">
    import { onDestroy } from "svelte";
    import { Filter } from "@lucide/svelte";
    import type { Game } from "$lib/api/game.svelte";
    import { EVENTS_BY_KEY, type EventInstance, type EventKey } from "$lib/app/events";
    import { LogLevel } from "$lib/app/utils";
    import { getSession } from "$lib/app/utils/di";
    import Popover from "$lib/ui/common/Popover.svelte";
    import EventLogRow from "./EventLogRow.svelte";

    type Props = {
        selectedGame: Game | null;
    };

    let { selectedGame }: Props = $props();

    const session = getSession();

    let selectedOnly = $state(false);
    let minimumLevel = $state(LogLevel.Info);
    let clock = $state(Date.now());
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const minimumLevelOptions = [
        LogLevel.Verbose,
        LogLevel.Debug,
        LogLevel.Info,
        LogLevel.Warning,
        LogLevel.Error,
    ] as const;

    const allEvents = $derived(session.eventLog.all);
    const visibleEvents = $derived.by(() => {
        return allEvents
            .filter((event) => eventLevel(event) >= minimumLevel)
            .filter((event) => !selectedOnly || matchesSelectedGame(event, selectedGame))
            .toReversed();
    });
    const totalEvents = $derived(allEvents.length);
    const filterLabel = $derived(`${selectedOnly ? "Game" : "All"} ${LogLevel[minimumLevel]}+`);
    const emptyText = $derived.by(() => {
        if (totalEvents === 0) return "No events yet.";
        if (selectedOnly && !selectedGame) return "Select a game to use selected-game filtering.";
        return "No events match these filters.";
    });
    const selectedScopeLabel = $derived(selectedGame ? selectedGame.name : "No game selected");

    $effect(() => {
        visibleEvents;
        clock;
        scheduleNextTick();
    });

    onDestroy(() => clearClockTimeout());

    function eventLevel(event: EventInstance<EventKey>): LogLevel {
        return event.levelOverride ?? EVENTS_BY_KEY[event.key].level ?? LogLevel.Info;
    }

    function matchesSelectedGame(event: EventInstance<EventKey>, game: Game | null): boolean {
        if (!game) return false;

        const data = event.data as Record<string, unknown> | undefined;
        if (!data || typeof data !== "object") return false;

        const eventGame = data.game as { id?: unknown } | undefined;
        if (eventGame?.id === game.conn.id) return true;
        if (data.gameId === game.conn.id) return true;
        if (data.id === game.conn.id) return true;

        return false;
    }

    function clearClockTimeout() {
        if (!timeout) return;
        clearTimeout(timeout);
        timeout = null;
    }

    function scheduleNextTick() {
        clearClockTimeout();

        const next = visibleEvents
            .map((event) => nextTimeBoundary(event.timestamp, clock))
            .filter((time): time is number => time !== null)
            .sort((a, b) => a - b)[0];

        if (!next) return;

        const delay = Math.max(250, next - Date.now());
        timeout = setTimeout(() => {
            clock = Date.now();
        }, delay);
    }

    function nextTimeBoundary(timestamp: number, now: number): number | null {
        const age = Math.max(0, now - timestamp);

        if (age < 5_000) return timestamp + 5_000;
        if (age < 60_000) return timestamp + (Math.floor(age / 5_000) + 1) * 5_000;
        if (age < 10 * 60_000) return timestamp + (Math.floor(age / 10_000) + 1) * 10_000;
        if (age < 60 * 60_000) return timestamp + (Math.floor(age / 60_000) + 1) * 60_000;

        return null;
    }
</script>

<section class="event-log" aria-label="Event log">
    <div class="event-log-header">
        <div class="title-group">
            <h2>Event Log</h2>
            <p>{visibleEvents.length} of {totalEvents} shown</p>
        </div>

        <Popover>
            {#snippet trigger(props)}
                <button
                    {...props}
                    class="filter-button"
                    type="button"
                    aria-label="Filter event log"
                    title="Filter event log"
                >
                    <Filter class="size-4" />
                    <span>{filterLabel}</span>
                </button>
            {/snippet}

            <div class="filter-panel">
                <div class="filter-group">
                    <p class="filter-heading">Scope</p>
                    <label>
                        <input type="radio" name="event-log-scope" checked={!selectedOnly} onchange={() => selectedOnly = false} />
                        <span>All events</span>
                    </label>
                    <label title={selectedScopeLabel}>
                        <input type="radio" name="event-log-scope" checked={selectedOnly} onchange={() => selectedOnly = true} />
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
                                checked={minimumLevel === level}
                                onchange={() => minimumLevel = level}
                            />
                            <span>{LogLevel[level]}+</span>
                        </label>
                    {/each}
                </div>
            </div>
        </Popover>
    </div>

    <div class="event-feed">
        {#each visibleEvents as event (event.id)}
            <EventLogRow {event} {clock} />
        {:else}
            <div class="empty-state">
                <p>{emptyText}</p>
            </div>
        {/each}
    </div>
</section>

<style lang="postcss">
    @reference "global.css";

    .event-log {
        @apply fcol-3 h-full min-h-0 p-2;
        @apply bg-neutral-50 dark:bg-neutral-900;
    }

    .event-log-header {
        @apply frow-2 min-w-0 items-start justify-between;
        @apply border-b border-neutral-200/70 pb-2 dark:border-neutral-700/60;
    }

    .title-group {
        @apply min-w-0 fcol-0.5;

        & h2 {
            @apply text-xl;
        }

        & p {
            @apply truncate text-xs text-neutral-500 dark:text-neutral-400;
        }
    }

    .filter-button {
        @apply frow-1.5 shrink-0 items-center rounded-md px-2 py-1.5;
        @apply border border-neutral-200/80 bg-white/80 text-xs font-medium text-neutral-700 shadow-sm;
        @apply transition-colors;
        @apply dark:border-neutral-700 dark:bg-surface-800/80 dark:text-neutral-100;

        &:hover {
            @apply bg-neutral-100 dark:bg-surface-700;
        }

        &:focus-visible {
            @apply outline-none ring-2 ring-primary-500;
        }
    }

    .filter-panel {
        @apply fcol-3 w-56 p-1;
    }

    .filter-group {
        @apply fcol-1;
    }

    .filter-heading {
        @apply px-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400;
    }

    .filter-group label {
        @apply frow-2 cursor-pointer items-center rounded-md px-2 py-1.5 text-sm;
        @apply text-neutral-700 transition-colors dark:text-neutral-200;

        &:hover {
            @apply bg-neutral-200/70 dark:bg-neutral-700/70;
        }

        &:has(input:focus-visible) {
            @apply ring-2 ring-primary-500;
        }

        & input {
            @apply size-3.5 accent-primary-500;
        }
    }

    .event-feed {
        @apply fcol-scroll-2 min-h-0 flex-1 pr-1;
    }

    .empty-state {
        @apply fcol-2 min-h-32 items-center justify-center rounded-lg border border-dashed;
        @apply border-neutral-300/80 px-3 text-center text-sm text-neutral-500;
        @apply dark:border-neutral-700 dark:text-neutral-400;
    }
</style>
