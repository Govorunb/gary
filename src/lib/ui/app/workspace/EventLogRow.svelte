<script lang="ts">
    import { ChevronDown } from "@lucide/svelte";
    import dayjs from "dayjs";
    import { EVENTS_BY_KEY, EVENTS_DISPLAY, type EventDef, type EventInstance, type EventKey } from "$lib/app/events";
    import { LogLevel } from "$lib/app/utils";
    import CodeMirror from "$lib/ui/common/CodeMirror.svelte";

    type Props = {
        event: EventInstance<EventKey>;
        clock: number;
    };

    let { event, clock }: Props = $props();

    let detailsOpen = $state(false);

    const levelConfig: Record<LogLevel, { label: string; class: string }> = {
        [LogLevel.Verbose]: { label: "Verbose", class: "level-verbose" },
        [LogLevel.Debug]: { label: "Debug", class: "level-debug" },
        [LogLevel.Info]: { label: "Info", class: "level-info" },
        [LogLevel.Success]: { label: "Success", class: "level-success" },
        [LogLevel.Warning]: { label: "Warning", class: "level-warning" },
        [LogLevel.Error]: { label: "Error", class: "level-error" },
        [LogLevel.Fatal]: { label: "Fatal", class: "level-fatal" },
    };

    const level = $derived(event.levelOverride ?? EVENTS_BY_KEY[event.key].level ?? LogLevel.Info);
    const config = $derived(levelConfig[level]);
    const presented = $derived(getPresentedEvent(event));
    const title = $derived(presented.title ?? "Event");
    const description = $derived(presented.description);
    const timestamp = $derived(formatEventTime(event.timestamp, clock));
    const absoluteTimestamp = $derived(dayjs(event.timestamp).format("MMM D, YYYY h:mm:ss A"));
    const detailJson = $derived(formatDetails(event, level));
    const hasDetails = $derived(event.data !== undefined);

    function getPresentedEvent(evt: EventInstance<EventKey>): { title?: string; description?: string } {
        const presenter = EVENTS_DISPLAY[evt.key] as ((data: never) => { title?: string; description?: string }) | undefined;
        const def = EVENTS_BY_KEY[evt.key] as EventDef;

        try {
            const result = presenter?.(evt.data as never);
            return {
                title: result?.title ?? def.description,
                description: result?.description,
            };
        } catch (error) {
            return {
                title: def.description,
                description: `Failed to render event presenter: ${error}`,
            };
        }
    }

    function formatEventTime(timestamp: number, now: number): string {
        const age = Math.max(0, now - timestamp);
        if (age < 5_000) return "now";
        if (age < 60_000) return `${Math.floor(age / 5_000) * 5}s`;
        if (age < 10 * 60_000) {
            const bucket = Math.floor(age / 10_000) * 10;
            const minutes = Math.floor(bucket / 60);
            const seconds = bucket % 60;
            return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
        }
        if (age < 60 * 60_000) return `${Math.floor(age / 60_000)}m`;

        const date = dayjs(timestamp);
        return date.isSame(dayjs(now), "day") ? date.format("h:mm A") : date.format("MMM D, h:mm A");
    }

    function formatDetails(evt: EventInstance<EventKey>, evtLevel: LogLevel): string {
        return JSON.stringify(
            {
                data: evt.data,
            },
            (_key, value) => {
                if (value instanceof Error) {
                    return {
                        name: value.name,
                        message: value.message,
                        stack: value.stack,
                    };
                }
                return value;
            },
            2,
        );
    }
</script>

<article class={["event-row", config.class]}>
    <div class="event-main">
        <div class="event-meta">
            <time title={absoluteTimestamp} datetime={new Date(event.timestamp).toISOString()}>{timestamp}</time>
            <span class="level-label">{config.label}</span>
        </div>

        <h3 class="event-title">{title}</h3>

        {#if description}
            <p class="event-description">{description}</p>
        {/if}

        {#if hasDetails}
            <details class="event-details" bind:open={detailsOpen}>
                <summary>
                    <ChevronDown class={["chevron-icon size-3.5", detailsOpen ? "open" : undefined]} />
                    <span>Details</span>
                </summary>
                <div class="details-editor">
                    <CodeMirror
                        code={detailJson}
                        open={detailsOpen}
                        readonly
                        minHeight="4rem"
                        maxHeight="12rem"
                    />
                </div>
            </details>
        {/if}
    </div>
</article>

<style lang="postcss">
    @reference "global.css";

    .event-row {
        @apply min-w-0 rounded-lg border p-2;
        @apply border-neutral-200/80 bg-white/70 text-neutral-800;
        @apply transition-colors;
        @apply dark:border-neutral-700/70 dark:bg-surface-800/55 dark:text-neutral-100;

        &:hover,
        &:focus-within {
            @apply border-neutral-300 bg-white;
            @apply dark:border-neutral-600 dark:bg-surface-800;
        }
    }

    .event-main {
        @apply min-w-0 fcol-1;
    }

    .event-meta {
        @apply frow-2 min-w-0 items-center text-[0.6875rem] font-medium;
        @apply text-neutral-500 dark:text-neutral-400;
    }

    .event-meta time {
        @apply shrink-0 tabular-nums;
    }

    .level-label {
        @apply shrink-0 rounded-sm px-1.5 py-0.5;
    }

    .event-title {
        @apply min-w-0 truncate text-sm font-semibold leading-5;
        @apply text-neutral-800 dark:text-neutral-50;
    }

    .event-description {
        @apply min-w-0 text-xs leading-4;
        @apply text-neutral-600 dark:text-neutral-300;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        overflow-wrap: anywhere;
    }

    .event-details {
        @apply mt-1 min-w-0 text-xs;

        & summary {
            @apply frow-1.5 w-fit cursor-pointer select-none items-center rounded-md px-1.5 py-1;
            @apply text-neutral-500 transition-colors dark:text-neutral-300;

            &:hover {
                @apply bg-neutral-100 text-neutral-700 dark:bg-neutral-700/60 dark:text-neutral-100;
            }

            &:focus-visible {
                @apply outline-none ring-2 ring-primary-500;
            }
        }
    }

    .chevron-icon {
        @apply transition-transform;
    }

    .chevron-icon.open {
        @apply rotate-180;
    }

    .details-editor {
        @apply mt-1 min-w-0;
    }

    .level-verbose .level-label,
    .level-debug .level-label {
        @apply bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300;
    }

    .level-info .level-label {
        @apply bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300;
    }

    .level-success .level-label {
        @apply bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300;
    }

    .level-warning .level-label {
        @apply bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300;
    }

    .level-error .level-label,
    .level-fatal .level-label {
        @apply bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300;
    }
</style>
