<script lang="ts">
    import type { Game } from "$lib/api/game.svelte";
    import { CircleX, Info, Skull, TriangleAlert, Check, CheckCheck, EyeOff, Eye, Undo, Undo2, ChevronDown } from '@lucide/svelte';
    import { DiagnosticSeverity, getDiagnosticById, type GameDiagnostic } from '$lib/api/diagnostics';
    import { tooltip } from '$lib/app/utils';
    import { boolAttr } from 'runed';
    import CodeMirror from '$lib/ui/common/CodeMirror.svelte';
    import dayjs from 'dayjs';

    type Props = {
        game: Game;
        diag: GameDiagnostic;
        shiftPressed: boolean;
    };

    let { game, diag, shiftPressed }: Props = $props();

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

    const def = $derived(getDiagnosticById(diag.id)!);
    const config = $derived(severityConfig[def.severity]);
    const Icon = $derived(config.icon);
    const hasContext = $derived(!!diag.context);
    let ctxOpen = $state(false);

    const isDismissed = $derived(diag.dismissed);
    const isSuppressed = $derived(game.diagnostics.isSuppressed(diag.id as any));

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
        game.diagnostics.dismiss(diag.id as any);
    }

    function restoreDiagnostic() {
        game.diagnostics.restore(diag.id as any);
    }

    function suppressDiagnostic() {
        game.diagnostics.suppress(diag.id as any);
    }

    function unsuppressDiagnostic() {
        const idx = game.diagnostics.suppressions.indexOf(diag.id as any);
        if (idx !== -1) {
            game.diagnostics.suppressions.splice(idx, 1);
        }
        restoreDiagnostic();
    }

    const contextJson = $derived(JSON.stringify(diag.context, null, 2));
</script>

<div
    class="diagnostic-item {config.class} group"
    data-dismissed={boolAttr(isDismissed)}
    data-shift={boolAttr(shiftPressed)}
>
    <div class="diagnostic-icon gap-2">
        <span class="note">{dayjs(diag.timestamp).toDate().toLocaleTimeString()}</span>
        <Icon size="20" />
    </div>
    <div class="diagnostic-content">
        <p class="diagnostic-message">{def.message}</p>
        {#if def.details}
            <p class="diagnostic-details">{def.details}</p>
        {/if}
        {#if hasContext}
            <details class="context-details" bind:open={ctxOpen}>
                <summary class="context-summary">
                    <ChevronDown size="14" class="chevron-icon" />
                    <span>Details</span>
                </summary>
                <div class="context-editor">
                    <CodeMirror
                        code={contextJson}
                        open={ctxOpen}
                        readonly
                        minHeight="4rem"
                        maxHeight="8rem"
                    />
                </div>
            </details>
        {/if}
    </div>
    <div class="actions">
        <button class="action-btn"
            onclick={() => isDismissed ? restoreSingle() : dismissSingle()}
            {@attach tooltip((isDismissed ? "Restore" : "Dismiss") + " this diagnostic")}
        >
            <Btn1Icon size="16" />
        </button>
        <button class="action-btn"
            onclick={() => isDismissed ? restoreDiagnostic() : dismissDiagnostic()}
            {@attach tooltip((isDismissed ? "Restore" : "Dismiss") + " all current diagnostics of this kind")}
        >
            <Btn2Icon size="16" />
        </button>
        <button class={["action-btn", isSuppressed ? "unsuppress" : "suppress"]}
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
        @apply relative flex gap-3 p-3 rounded-lg;
        @apply border transition-colors;

        &.severity-error, &.severity-fatal {
            @apply bg-red-50 dark:bg-red-900/20;
            @apply border-red-200 dark:border-red-800;
        }

        &.severity-warning {
            @apply bg-amber-50 dark:bg-amber-900/20;
            @apply border-amber-200 dark:border-amber-800;
        }

        &.severity-info {
            @apply bg-sky-50 dark:bg-sky-900/20;
            @apply border-sky-200 dark:border-sky-800;
        }
        @apply data-dismissed:opacity-60;
    }

    .diagnostic-icon {
        @apply shrink-0 flex items-center justify-center;
    }

    .diagnostic-icon.severity-error, .diagnostic-icon.severity-fatal {
        @apply text-red-600 dark:text-red-400;
    }

    .diagnostic-icon.severity-warning {
        @apply text-amber-600 dark:text-amber-400;
    }

    .diagnostic-icon.severity-info {
        @apply text-sky-600 dark:text-sky-400;
    }

    .diagnostic-content {
        @apply flex flex-col gap-1 min-w-0;
    }

    .actions {
        @apply absolute top-2 right-2 flex items-center gap-1 transition-opacity;
        @apply opacity-0 group-hover:opacity-100 focus-within:opacity-100;
        @apply group-data-shift:opacity-100;
    }

    .action-btn {
        @apply p-1.5 rounded-md transition-colors text-neutral-400;
        &:hover {
            @apply bg-neutral-200 dark:bg-surface-700;
            @apply text-neutral-900 dark:text-neutral-100;
        }
        &.suppress {
            &:hover {
                @apply text-warning-700 dark:text-warning-300;
                @apply bg-warning-100 dark:bg-warning-900/20;
            }
        }
        &.unsuppress {
            &:hover {
                @apply text-emerald-700 dark:text-emerald-300;
                @apply bg-emerald-100 dark:bg-emerald-900/20;
            }
        }
    }

    .diagnostic-message {
        @apply font-medium;
    }

    .diagnostic-details {
        @apply text-neutral-600 dark:text-neutral-400;
        @apply text-xs whitespace-pre-line;
    }

    .context-details {
        @apply mt-2;
    }

    .context-summary {
        @apply flex items-center gap-1.5 cursor-pointer select-none;
        @apply text-xs font-medium text-sky-700 dark:text-sky-300;
        @apply hover:text-sky-800 dark:hover:text-sky-200;
        &::marker {
            @apply hidden;
            @apply open:rotate-180;
        }
    }

    .context-editor {
        @apply mt-2;
    }

    .chevron-icon {
        @apply transition-transform;
    }
</style>
