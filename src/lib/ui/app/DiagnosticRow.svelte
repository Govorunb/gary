<script lang="ts">
    import type { Game } from "$lib/api/game.svelte";
    import { CircleX, Info, Skull, TriangleAlert, Check, CheckCheck, EyeOff, Eye, Undo, Undo2, ChevronDown } from '@lucide/svelte';
    import { DIAGNOSTICS_BY_KEY, DiagnosticSeverity, type DiagnosticKey, type GameDiagnostic } from '$lib/api/diagnostics';
    import { tooltip } from '$lib/app/utils';
    import { boolAttr } from 'runed';
    import CodeMirror from '$lib/ui/common/CodeMirror.svelte';
    import dayjs from 'dayjs';
    import { pressedKeys } from "$lib/app/utils/hotkeys.svelte";

    type Props = {
        game: Game;
        diag: GameDiagnostic<DiagnosticKey>;
    };

    let { game, diag }: Props = $props();

    const severityConfig: Record<DiagnosticSeverity, { icon: typeof CircleX; label: string; class: string }> = {
        [DiagnosticSeverity.Fatal]: {
            icon: Skull,
            label: 'Fatal',
            class: 'severity-fatal'
        },
        [DiagnosticSeverity.Error]: {
            icon: CircleX,
            label: 'Error',
            class: 'severity-error'
        },
        [DiagnosticSeverity.Warning]: {
            icon: TriangleAlert,
            label: 'Warning',
            class: 'severity-warning'
        },
        [DiagnosticSeverity.Info]: {
            icon: Info,
            label: 'Info',
            class: 'severity-info'
        }
    };

    const def = $derived(DIAGNOSTICS_BY_KEY[diag.key]);
    const config = $derived(severityConfig[def.severity]);
    const Icon = $derived(config.icon);
    const hasContext = $derived(!!diag.context);
    let ctxOpen = $state(false);

    const isDismissed = $derived(diag.dismissed);
    const isSuppressed = $derived(game.diagnostics.isSuppressed(diag.key));

    const Btn1Icon = $derived(isDismissed ? Undo : Check);
    const Btn2Icon = $derived(isDismissed ? Undo2 : CheckCheck);
    const Btn3Icon = $derived(isSuppressed ? Eye : EyeOff);

    function dismissSingle() {
        diag.dismissed = true;
    }

    function restoreSingle() {
        diag.dismissed = false;
    }

    function dismissDiagnostic() {
        game.diagnostics.dismiss(diag.key);
    }

    function restoreDiagnostic() {
        game.diagnostics.restore(diag.key);
    }

    function suppressDiagnostic() {
        game.diagnostics.suppress(diag.key);
    }

    function unsuppressDiagnostic() {
        game.diagnostics.unsuppress(diag.key);
    }

    const contextJson = $derived(JSON.stringify(diag.context, null, 2));

    const shiftPressed = $derived(pressedKeys.has('Shift'));
</script>

<div
    class="diagnostic-item {config.class} {ctxOpen ? 'context-open' : 'context-closed'} group"
    data-dismissed={boolAttr(isDismissed)}
    data-shift={boolAttr(shiftPressed)}
>
    <div class="diagnostic-icon gap-2">
        <span class="note">{dayjs(diag.timestamp).toDate().toLocaleTimeString()}</span>
        <Icon size="20" />
    </div>
    <p class="diagnostic-title" title={def.key}>{def.title}</p>
    {#if def.description}
        <p class="diagnostic-desc">{def.description}</p>
    {/if}
    {#if hasContext}
        <details class="details-box context-details" bind:open={ctxOpen}>
            <summary>
                <ChevronDown size="14" class="chevron-icon" />
                <span>Details</span>
            </summary>
            <div class="context-editor">
                <CodeMirror
                    code={contextJson}
                    open={ctxOpen}
                    readonly
                    minHeight="4rem"
                    maxHeight="16rem"
                />
            </div>
        </details>
    {/if}
    <div class="actions">
        <button class="icon-btn action-btn"
            onclick={() => isDismissed ? restoreSingle() : dismissSingle()}
            {@attach tooltip((isDismissed ? "Restore" : "Dismiss") + " this diagnostic")}
        >
            <Btn1Icon size="16" />
        </button>
        <button class="icon-btn action-btn"
            onclick={() => isDismissed ? restoreDiagnostic() : dismissDiagnostic()}
            {@attach tooltip((isDismissed ? "Restore" : "Dismiss") + " all current diagnostics of this kind")}
        >
            <Btn2Icon size="16" />
        </button>
        <button class={["icon-btn action-btn", isSuppressed ? "unsuppress" : "suppress"]}
            onclick={() => isSuppressed ? unsuppressDiagnostic() : suppressDiagnostic()}
            {@attach tooltip((isSuppressed ? "Show" : "Never show") + " this diagnostic kind again")}
        >
            <Btn3Icon size="16" />
        </button>
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    .diagnostic-item {
        --tone: var(--color-ink-3);
        @apply relative px-2 py-2 rounded-md transition-colors;
        display: grid;
        grid-template-columns: auto 1fr;
        grid-template-rows: auto auto auto;
        gap: 0.25rem 0.75rem;

        &.severity-error, &.severity-fatal { --tone: var(--color-lvl-err); }
        &.severity-warning { --tone: var(--color-lvl-warn); }
        &.severity-info { --tone: var(--color-accent); }
        &:hover, &:focus-within { @apply bg-layer-2; }
        /* Warnings and errors carry a faint tint, like event rows. */
        &.severity-warning, &.severity-error, &.severity-fatal {
            background-color: color-mix(in oklab, var(--tone) 7%, transparent);
            &:hover, &:focus-within { background-color: color-mix(in oklab, var(--tone) 12%, transparent); }
        }
        @apply data-dismissed:opacity-60;

        &.context-closed .diagnostic-icon {
            grid-row: 1 / span 3;
        }

        &.context-open .diagnostic-icon {
            grid-row: 1 / span 2;
        }

        .diagnostic-icon {
            grid-column: 1;
            @apply shrink-0 flex items-center justify-center;
            color: var(--tone);
            transition: all 150ms ease;
        }

        .diagnostic-title {
            grid-row: 1;
            grid-column: 2;
            @apply font-medium text-ink-0;
        }

        .diagnostic-desc {
            grid-row: 2;
            grid-column: 2;
            @apply text-xs text-ink-2 whitespace-pre-line;
        }

        .context-details {
            grid-row: 3;
            grid-column: 2;
            transition: all 150ms ease;
        }

        &.context-open .context-details {
            grid-column: 1 / span 2;
            max-width: 100%;
        }

        .actions {
            @apply absolute top-2 right-2 frow-1 items-center transition-opacity;
            @apply opacity-0 group-hover:opacity-100 focus-within:opacity-100;
            @apply group-data-shift:opacity-100;
        }
    }

    .action-btn {
        @apply size-6 text-ink-3;
        &.suppress:hover { @apply text-lvl-warn; }
        &.unsuppress:hover { @apply text-lvl-ok; }
    }

    /* Plain disclosure, like the event log: text link, then a framed editor in the row's padding. */
    .context-details {
        @apply mt-1 gap-1.5;
        & > summary {
            @apply h-6 mx-0 px-0 text-xs font-medium text-accent bg-transparent;
            &:hover { @apply bg-transparent text-ink-0; }
        }
        &[open] > summary { @apply bg-transparent text-accent; }
    }

    .context-editor {
        @apply w-full;
    }

    .chevron-icon {
        @apply transition-transform open:rotate-180;
    }
</style>
