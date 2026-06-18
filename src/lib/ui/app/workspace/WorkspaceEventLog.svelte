<script lang="ts">
    import { EllipsisVertical, Filter } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import type { Game } from "$lib/api/game.svelte";
    import { EVENTS_BY_KEY, redactSensitiveData, type EventDef, type EventInstance, type EventKey } from "$lib/app/events";
    import { LogLevel } from "$lib/app/utils";
    import { getSession } from "$lib/app/utils/di";
    import Popover from "$lib/ui/common/Popover.svelte";
    import VirtualLog from "$lib/ui/common/VirtualLog.svelte";
    import EventLogRow from "./EventLogRow.svelte";

    type Props = {
        selectedGame: Game | null;
    };

    let { selectedGame }: Props = $props();

    const session = getSession();

    let selectedOnly = $state(false);
    let minimumLevel = $state(LogLevel.Info);
    let menuOpen = $state(false);
    let clock = $state(Date.now());
    let clockInterval: ReturnType<typeof setInterval> | null = null;

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
            .filter((event) => !selectedOnly || matchesSelectedGame(event, selectedGame));
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
        clockInterval ??= setInterval(() => {
            clock = Date.now();
        }, 5_000);

        return () => {
            if (!clockInterval) return;
            clearInterval(clockInterval);
            clockInterval = null;
        };
    });

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

    function closeMenu() {
        menuOpen = false;
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
    <div class="event-log-header">
        <div class="title-group">
            <h2>Event Log</h2>
            <p>{visibleEvents.length} of {totalEvents} shown</p>
        </div>

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

            <Popover modal open={menuOpen} onOpenChange={(d) => menuOpen = d.open}>
                {#snippet trigger(props)}
                    <button
                        {...props}
                        class="menu-trigger"
                        type="button"
                        aria-label="Event log menu"
                        title="Event log menu"
                    >
                        <EllipsisVertical class="size-4" />
                    </button>
                {/snippet}

                <button class="menu-item" type="button" onclick={copyVisibleEventsJson}>
                    Copy JSON
                </button>
            </Popover>
        </div>
    </div>

    <VirtualLog
        class="event-feed"
        items={visibleEvents}
        getKey={(event) => event.id}
        estimateSize={56}
        overscan={12}
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

    .header-actions {
        @apply frow-1.5 shrink-0 items-center;
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

    .menu-trigger {
        @apply flex size-8 shrink-0 items-center justify-center rounded-md;
        @apply border border-neutral-200/80 bg-white/80 text-neutral-700 shadow-sm;
        @apply transition-colors;
        @apply dark:border-neutral-700 dark:bg-surface-800/80 dark:text-neutral-100;

        &:hover {
            @apply bg-neutral-100 dark:bg-surface-700;
        }

        &:focus-visible {
            @apply outline-none ring-2 ring-primary-500;
        }
    }

    .menu-item {
        @apply w-full rounded-sm px-3 py-2;
        @apply text-left text-sm text-neutral-700 transition-colors duration-150 dark:text-neutral-300;

        &:hover {
            @apply bg-neutral-200/70 dark:bg-neutral-700/70;
        }

        &:focus-visible {
            @apply outline-none ring-1 ring-neutral-400 dark:ring-neutral-600;
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
        @apply min-h-0 flex-1 pr-1;
    }

    .empty-state {
        @apply fcol-2 min-h-32 items-center justify-center rounded-lg border border-dashed;
        @apply border-neutral-300/80 px-3 text-center text-sm text-neutral-500;
        @apply dark:border-neutral-700 dark:text-neutral-400;
    }
</style>
