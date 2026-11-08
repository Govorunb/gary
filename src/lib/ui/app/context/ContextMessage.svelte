<script lang="ts">
    import { getRegistry, getSession, getUIState } from "#lib/app/utils/di.js";
    import { tooltip } from "#lib/app/utils/index.js";
    import { boolAttr } from "runed";
    import { pressedKeys } from "#lib/app/utils/hotkeys.svelte.js";
    import dayjs from "dayjs";
    import { Bot, Gamepad2, Settings, User } from "@lucide/svelte";
    import type { ContextRow, ContextSource } from "./formatters/types";

    import type { MenuRequest } from "./ContextMessageMenu.svelte";

    interface Props {
        row: ContextRow;
        /** The log shares one menu between its rows; a menu per row makes mounting a thousand of them slow. */
        onmenu: (request: MenuRequest) => void;
    }

    const { row, onmenu }: Props = $props();
    const event = $derived(row.event);
    const rendered = $derived(row.rendered);
    const source = $derived(row.source);
    const timestamp = $derived(dayjs(event.timestamp));

    const session = getSession();
    const registry = getRegistry();
    const uiState = getUIState();
    let menuButton: HTMLButtonElement;

    function openMenu(evt: MouseEvent) {
        evt.preventDefault();
        onmenu({ row, button: menuButton, point: { x: evt.clientX, y: evt.clientY } });
    }

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
    const lines = $derived((rendered?.text.match(/\n/g)?.length ?? 0) + 1);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions : the menu is also available through its button -->
<div class={["message", source.type]}
    oncontextmenu={openMenu}
    class:silent={rendered?.silent === true /* boolean | "noAct" */}
    data-continues={boolAttr(row.continues)}
    data-details={boolAttr(detailsHeld)}
    style:--lines={lines}
>
    <span class="message-icon" {@attach tooltip(source.type)}>
        {#if !row.continues}
            <SourceIcon />
        {/if}
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
    <button class="icon-btn message-menu" bind:this={menuButton}
        aria-label="Message menu" title="Message menu"
        onclick={() => onmenu({ row, button: menuButton })}
    >
        <!-- Lucide's ellipsis-vertical as plain markup: the icon component costs more than the rest of the row. -->
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
        </svg>
    </button>
    {#if metricsText}
        <span class="message-metrics" {@attach tooltip("Engine latency · tokens used")}>{metricsText}</span>
    {/if}
</div>

<style lang="postcss">
    @reference "global.css";

    .message {
        --src: var(--color-ink-3);
        /* Flex, not grid: WebKit lays a grid's multi-line text out several times, and a thousand new rows took seconds. */
        @apply relative frow-2 items-start pl-3 pr-3 pt-1.5 pb-1.5 wrap-anywhere;
        background-color: color-mix(in oklab, var(--src) 4%, transparent);
        border-top: 1px solid var(--color-layer-0);
        /* The log can hold a thousand rows; skip laying out the ones off screen, or every width change reflows them all.
           A row that hasn't rendered yet reserves its line count, and its real height after that. */
        content-visibility: auto;
        contain-intrinsic-size: auto calc(var(--lines) * 1lh + 1.125rem); /* the content box (header, gap, text); padding goes on top */
        &[data-continues] { contain-intrinsic-size: auto max(calc(var(--lines) * 1lh), calc(1.25rem + 1px)); /* at least the icon */ }
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
        @apply flex size-5 shrink-0 items-center justify-center rounded cursor-default mt-px;
        color: var(--src);
        background-color: color-mix(in oklab, var(--src) 18%, transparent);
        & > :global(svg) { @apply size-3; }
    }
    .message-content {
        @apply fcol-0.5 flex-1 min-w-0;
    }
    .message-header {
        /* A set height: the row's reserved height counts on it, and mixed font sizes on one baseline differ by engine. */
        @apply frow-2 items-baseline h-4;
    }
    .message-timestamp {
        @apply text-[11px] text-ink-3 tabular-nums cursor-default;
    }
    .message-text {
        @apply pl-0.75 whitespace-pre-wrap text-ink-1;
    }
    .message-menu {
        @apply size-5 opacity-0;
        .message:hover &, .message:focus-within & { @apply opacity-100; }
        @media (hover: none) { @apply opacity-100; }
    }
    .message-metrics {
        @apply absolute top-1 right-10 font-mono text-[11px] text-ink-3 tabular-nums cursor-default;
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
