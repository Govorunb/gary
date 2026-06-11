<script lang="ts">
    import { Bug, Check, ChevronDown, CircleX, Info, Logs, Skull, TriangleAlert } from "@lucide/svelte";
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

    const levelConfig: Record<LogLevel, { icon: typeof Info; label: string; class: string }> = {
        [LogLevel.Verbose]: { icon: Logs, label: "Verbose", class: "level-verbose" },
        [LogLevel.Debug]: { icon: Bug, label: "Debug", class: "level-debug" },
        [LogLevel.Info]: { icon: Info, label: "Info", class: "level-info" },
        [LogLevel.Success]: { icon: Check, label: "Success", class: "level-success" },
        [LogLevel.Warning]: { icon: TriangleAlert, label: "Warning", class: "level-warning" },
        [LogLevel.Error]: { icon: CircleX, label: "Error", class: "level-error" },
        [LogLevel.Fatal]: { icon: Skull, label: "Fatal", class: "level-fatal" },
    };

    const level = $derived(event.levelOverride ?? EVENTS_BY_KEY[event.key].level ?? LogLevel.Info);
    const config = $derived(levelConfig[level]);
    const LevelIcon = $derived(config.icon);
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
            return `${Math.floor(age / 60_000)}m`;
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

{#snippet eventHeader(disclosure = false)}
    <div class="event-rail">
        <span class="level-icon" title={config.label} aria-label={`Log level: ${config.label}`}>
            <LevelIcon class="size-3.5" />
        </span>
        <time class="event-time" title={absoluteTimestamp} datetime={new Date(event.timestamp).toISOString()}>{timestamp}</time>
    </div>

    <div class="event-main">
        <div class="event-summary">
            <h3 class="event-title">{title}</h3>

            {#if disclosure}
                <span class="details-affordance" aria-hidden="true">
                    <ChevronDown class={["chevron-icon size-3.5", detailsOpen ? "open" : undefined]} />
                </span>
            {/if}
        </div>

        {#if description}
            <p class="event-description">{description}</p>
        {/if}
    </div>
{/snippet}

{#if hasDetails}
    <details class={["event-row", config.class]} bind:open={detailsOpen}>
        <summary class="event-header">
            {@render eventHeader(true)}
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
{:else}
    <article class={["event-row", config.class]}>
        <div class="event-header">
            {@render eventHeader()}
        </div>
    </article>
{/if}

<style lang="postcss">
    @reference "global.css";

    .event-row {
        @apply min-h-10 min-w-0 shrink-0 rounded-lg border p-1.5 pr-2;
        @apply border-neutral-200/80 bg-white/70 text-neutral-800;
        @apply transition-colors;
        @apply dark:border-neutral-700/70 dark:bg-surface-800/55 dark:text-neutral-100;

        &:hover,
        &:focus-within {
            @apply border-neutral-300 bg-white;
            @apply dark:border-neutral-600 dark:bg-surface-800;
        }
    }

    details.event-row {
        @apply p-0;
    }

    .event-header {
        @apply grid min-h-7 min-w-0 items-start gap-2;
        grid-template-columns: 1.5rem minmax(0, 1fr);
    }

    details.event-row > summary.event-header {
        @apply cursor-pointer select-none rounded-lg p-1.5 pr-2;
        list-style: none;

        &::-webkit-details-marker {
            display: none;
        }

        &:focus-visible {
            @apply outline-none ring-2 ring-primary-500;
        }
    }

    .event-main {
        @apply min-w-0 fcol-1;
    }

    .event-rail {
        @apply flex h-full min-h-7 w-6 flex-col items-center justify-start gap-0.5 self-start;
    }

    .event-summary {
        @apply grid min-w-0 items-center gap-1.5;
        grid-template-columns: minmax(0, 1fr) max-content;
    }

    .level-icon {
        @apply flex size-5 items-center justify-center rounded-md;
    }

    .event-time {
        @apply w-6 text-center text-[0.625rem] font-semibold leading-3 tabular-nums;
        @apply text-neutral-500 dark:text-neutral-400;
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

    .details-affordance {
        @apply frow-1.5 size-5 items-center justify-center justify-self-end rounded-md;
        @apply text-neutral-500 transition-colors dark:text-neutral-300;
    }

    details.event-row > summary:hover .details-affordance {
        @apply bg-neutral-100 text-neutral-700 dark:bg-neutral-700/60 dark:text-neutral-100;
    }

    .chevron-icon {
        @apply transition-transform;
    }

    .chevron-icon.open {
        @apply rotate-180;
    }

    .details-editor {
        @apply mx-1.5 mb-1.5 min-w-0;
    }

    .level-verbose .level-icon,
    .level-debug .level-icon {
        @apply bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300;
    }

    .level-info .level-icon {
        @apply bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300;
    }

    .level-success .level-icon {
        @apply bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300;
    }

    .level-warning .level-icon {
        @apply bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300;
    }

    .level-error .level-icon,
    .level-fatal .level-icon {
        @apply bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300;
    }
</style>
