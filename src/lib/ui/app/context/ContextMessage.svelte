<script lang="ts">
    import { getRegistry, getSession, getUIState } from "$lib/app/utils/di";
    import { tooltip } from "$lib/app/utils";
    import { boolAttr } from "runed";
    import { pressedKeys } from "$lib/app/utils/hotkeys.svelte";
    import dayjs from "dayjs";
    import { Bot, Gamepad2, Settings, User } from "@lucide/svelte";
    import type { ContextRow, ContextSource } from "./formatters/types";

    interface Props {
        row: ContextRow;
    }

    const { row }: Props = $props();
    const event = $derived(row.event);
    const rendered = $derived(row.rendered);
    const source = $derived(row.source);
    const timestamp = $derived(dayjs(event.timestamp));

    const session = getSession();
    const registry = getRegistry();
    const uiState = getUIState();

    const sourceIcons: Record<ContextSource["type"], typeof Settings> = {
        system: Settings,
        client: Gamepad2,
        user: User,
        actor: Bot,
    };
    const SourceIcon = $derived(sourceIcons[source.type]);

    const metrics = $derived(rendered?.metrics);
    const metricsText = $derived.by(() => {
        if (!metrics) return null;
        const seconds = metrics.latencyMs < 1000 ? `${metrics.latencyMs}ms` : `${(metrics.latencyMs / 1000).toFixed(1)}s`;
        return metrics.tokens === undefined ? seconds : `${seconds} · ${metrics.tokens} tok`;
    });
    // The details modifier reveals metrics on every row at once.
    const detailsHeld = $derived(pressedKeys.has("Shift") && !uiState.anyDialogOpen);
</script>

<div class={["message", source.type]}
    class:silent={rendered?.silent === true /* boolean | "noAct" */}
    data-continues={boolAttr(row.continues)}
    data-details={boolAttr(detailsHeld)}
>
    <span class="message-icon" {@attach tooltip(source.type)}>
        <SourceIcon />
    </span>
    <div class="message-content">
        {#if !row.continues}
            <div class="message-header">
                <span class="message-timestamp" {@attach tooltip(timestamp.toString())}>
                    {timestamp.format("LTS")}
                </span>
                {#if source.type === 'client'}
                    {const id = $derived(source.id)}
                    {const game = $derived(registry.getGame(id))}
                    <button class="message-title"
                        tabindex="-1"
                        data-gone={boolAttr(!game)}
                        onclick={() => game && uiState.selectGameTab(id)}
                        title={`ID: ${id}\nClick to focus game tab`}
                    >
                        {source.name}
                    </button>
                {:else if source.type === 'actor'}
                    {const id = $derived(source.engineId)}
                    {const engine = $derived(session.engines[id])}
                    <button class="message-title"
                        tabindex="-1"
                        data-gone={boolAttr(!engine)}
                        onclick={() => engine && uiState.dialogs.openEngineConfig(id)}
                        title={`ID: ${id}\nClick to open engine config`}
                    >
                        {engine?.name ?? id}
                    </button>
                {:else if source.type === 'user'}
                    <span class="message-title">You</span>
                {/if}
            </div>
        {/if}
        <span class="message-text" title={row.continues ? timestamp.format("LTS") : undefined}>{rendered?.text ?? ""}</span>
    </div>
    {#if metricsText}
        <span class="message-metrics" {@attach tooltip("Engine latency · tokens used")}>{metricsText}</span>
    {/if}
</div>

<style lang="postcss">
    @reference "global.css";

    .message {
        --src: var(--color-ink-3);
        @apply relative grid gap-x-2 pl-3 pr-3 pt-1.5 pb-1.5 wrap-anywhere;
        grid-template-columns: 1.25rem minmax(0, 1fr);
        background-color: color-mix(in oklab, var(--src) 4%, transparent);
        border-top: 1px solid var(--color-layer-0);
        &::before {
            content: "";
            @apply absolute left-0 top-0 bottom-0 w-[3px];
            background-color: var(--src);
        }
        &[data-continues] {
            @apply pt-0 border-t-0;
        }
        &[data-continues] .message-icon {
            @apply invisible;
        }
        &.system { --src: var(--color-src-system); }
        &.client { --src: var(--color-src-client); }
        &.user { --src: var(--color-src-user); }
        &.actor { --src: var(--color-src-actor); }
        &.silent {
            @apply opacity-60 hover:opacity-100 transition-opacity;
        }
    }
    .message-icon {
        @apply flex size-5 items-center justify-center rounded cursor-default mt-px;
        color: var(--src);
        background-color: color-mix(in oklab, var(--src) 18%, transparent);
        & > :global(svg) { @apply size-3; }
    }
    .message-content {
        @apply fcol-0.5 min-w-0;
    }
    .message-header {
        @apply frow-2 items-baseline;
    }
    .message-timestamp {
        @apply text-[11px] text-ink-3 tabular-nums cursor-default;
    }
    .message-text {
        @apply whitespace-pre-wrap text-ink-1;
    }
    .message-metrics {
        @apply absolute top-1 right-3 font-mono text-[11px] text-ink-3 tabular-nums cursor-default;
        @apply opacity-0 transition-opacity;
        .message:hover &, .message[data-details] & { @apply opacity-100; }
    }
    .message-title {
        @apply text-xs font-semibold text-ink-1;
    }
    /* Clickable names read as chips on hover so the jump is discoverable. */
    button.message-title {
        @apply -mx-1 px-1 rounded cursor-pointer transition-colors;
        &:hover {
            @apply text-ink-0;
            background-color: color-mix(in oklab, var(--src) 18%, transparent);
        }
        &[data-gone] {
            @apply line-through opacity-60 cursor-default;
            &:hover { @apply text-ink-1 bg-transparent; }
        }
    }
</style>
