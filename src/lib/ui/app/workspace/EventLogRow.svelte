<script lang="ts">
    import { Bug, Check, ChevronDown, CircleX, Eye, Info, Logs, Skull, TriangleAlert } from "@lucide/svelte";
    import dayjs from "dayjs";
    import { EVENTS_BY_KEY, EVENTS_DISPLAY, eventLevel, hasSensitiveSchemaField, type EventDef, type EventInstance, type EventKey } from "$lib/app/events";
    import { LogLevel } from "$lib/app/utils";
    import { getUserPrefs } from "$lib/app/utils/di";
    import CodeMirror from "$lib/ui/common/CodeMirror.svelte";
    import { formatEventTime } from "./event-time";

    type Props = {
        event: EventInstance<EventKey>;
        clock: number;
    };

    let { event, clock }: Props = $props();

    const userPrefs = getUserPrefs();

    let detailsOpen = $state(false);
    let sensitiveInfoRevealed = $state(false);

    const levelConfig: Record<LogLevel, { icon: typeof Info; label: string; class: string }> = {
        [LogLevel.Verbose]: { icon: Logs, label: "Verbose", class: "level-verbose" },
        [LogLevel.Debug]: { icon: Bug, label: "Debug", class: "level-debug" },
        [LogLevel.Info]: { icon: Info, label: "Info", class: "level-info" },
        [LogLevel.Success]: { icon: Check, label: "Success", class: "level-success" },
        [LogLevel.Warning]: { icon: TriangleAlert, label: "Warning", class: "level-warning" },
        [LogLevel.Error]: { icon: CircleX, label: "Error", class: "level-error" },
        [LogLevel.Fatal]: { icon: Skull, label: "Fatal", class: "level-fatal" },
    };

    const level = $derived(eventLevel(event));
    const config = $derived(levelConfig[level]);
    const LevelIcon = $derived(config.icon);
    const presented = $derived(getPresentedEvent(event));
    const title = $derived(presented.title ?? "Event");
    const description = $derived(presented.description);
    const timestamp = $derived(formatEventTime(event.timestamp, clock));
    const absoluteTimestamp = $derived(dayjs(event.timestamp).format("MMM D, YYYY h:mm:ss A"));
    const detailJson = $derived(formatDetails(event, level));
    const hasDetails = $derived(event.data !== undefined);
    const hasSensitiveDetails = $derived(hasDetails && hasSensitiveSchemaField((EVENTS_BY_KEY[event.key] as EventDef).dataSchema));
    const sensitiveDetailsHidden = $derived(hasSensitiveDetails && userPrefs.app.hideSensitiveInfo && !sensitiveInfoRevealed);

    $effect(() => {
        if (!detailsOpen) sensitiveInfoRevealed = false;
    });

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

    function showSensitiveInfo(evt: MouseEvent) {
        evt.preventDefault();
        evt.stopPropagation();
        sensitiveInfoRevealed = true;
    }
</script>

{#snippet eventHeader(disclosure = false)}
    <span class="level-icon" title={config.label} aria-label={`Log level: ${config.label}`}>
        <LevelIcon class="size-3.5" />
    </span>

    <div class="event-main">
        <div class="event-summary">
            <h3 class="event-title">{title}</h3>
            <time class="event-time" title={absoluteTimestamp} datetime={new Date(event.timestamp).toISOString()}>{timestamp}</time>
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

        <div class="details-editor" class:sensitive-details={sensitiveDetailsHidden}>
            <div class="details-code" class:blurred={sensitiveDetailsHidden} aria-hidden={sensitiveDetailsHidden}>
                <CodeMirror
                    code={detailJson}
                    open={detailsOpen}
                    readonly
                    minHeight="4rem"
                    maxHeight="12rem"
                />
            </div>

            {#if sensitiveDetailsHidden}
                <button
                    class="sensitive-overlay"
                    type="button"
                    onclick={showSensitiveInfo}
                    aria-label="Show sensitive event details"
                >
                    <span class="sensitive-title">Sensitive info hidden</span>
                    <span class="sensitive-action">
                        <Eye class="size-3.5" />
                        Show sensitive info
                    </span>
                </button>
            {/if}
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
        --lvl: var(--color-ink-3);
        @apply min-w-0 shrink-0 rounded-md transition-colors;
        &:hover,
        &:focus-within {
            @apply bg-layer-2;
        }
    }
    .level-warning,
    .level-error,
    .level-fatal {
        background-color: color-mix(in oklab, var(--lvl) 7%, transparent);
        &:hover, &:focus-within {
            background-color: color-mix(in oklab, var(--lvl) 12%, transparent);
        }
    }
    .event-header {
        @apply grid min-w-0 items-start gap-2 px-2 py-1.5;
        grid-template-columns: 0.875rem minmax(0, 1fr);
    }
    details.event-row > summary.event-header {
        @apply cursor-pointer select-none rounded-md;
        list-style: none;
        &::-webkit-details-marker {
            display: none;
        }
        &:focus-visible {
            @apply outline-none ring-2 ring-inset ring-accent;
        }
    }
    .event-main {
        @apply min-w-0 fcol-0.5;
    }
    .event-summary {
        @apply frow-1.5 min-w-0 items-center;
    }
    .level-icon {
        @apply flex size-3.5 items-center justify-center mt-[3px];
        color: var(--lvl);
    }
    .event-time {
        @apply text-[11px] leading-4 tabular-nums text-ink-3 shrink-0;
    }
    .event-title {
        @apply min-w-0 truncate text-[13px] font-medium leading-5 text-ink-0;
    }
    .event-description {
        @apply min-w-0 font-mono text-[11px] leading-4 text-ink-2;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        overflow: hidden;
        overflow-wrap: anywhere;
    }
    .details-affordance {
        @apply flex size-4 items-center justify-center ml-auto rounded text-ink-3 transition-colors;
    }
    details.event-row > summary:hover .details-affordance {
        @apply text-ink-1;
    }
    .chevron-icon {
        @apply transition-transform;
    }
    .chevron-icon.open {
        @apply rotate-180;
    }
    .details-editor {
        @apply relative mx-2 mb-2 min-w-0;
    }
    .details-code {
        @apply min-w-0;
    }
    .details-code.blurred {
        @apply pointer-events-none select-none;
        filter: blur(3px);
    }
    .sensitive-overlay {
        @apply absolute inset-0 z-10 fcol-1 items-center justify-center rounded-lg px-3 py-2 text-center;
        @apply bg-layer-3 ring-1 ring-lvl-warn/60 text-ink-1 shadow-sm transition-colors;
        &:hover {
            @apply bg-layer-4;
        }
        &:focus-visible {
            @apply outline-none ring-2 ring-lvl-warn;
        }
    }
    .sensitive-title {
        @apply text-sm font-semibold leading-5;
    }
    .sensitive-action {
        @apply frow-1.5 items-center text-xs font-medium leading-4 text-lvl-warn;
    }
    .level-verbose,
    .level-debug { --lvl: var(--color-ink-3); }
    .level-info { --lvl: var(--color-accent); }
    .level-success { --lvl: var(--color-lvl-ok); }
    .level-warning { --lvl: var(--color-lvl-warn); }
    .level-error,
    .level-fatal { --lvl: var(--color-lvl-err); }
</style>
