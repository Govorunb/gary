<script lang="ts">
    import Dialog from '$lib/ui/common/Dialog.svelte';
    import type { Game } from "$lib/api/game.svelte";
    import { CircleX, Info, Skull, TriangleAlert, Check, CheckCheck, EyeOff, Eye, Undo, Undo2 } from '@lucide/svelte';
    import { DiagnosticSeverity, getDiagnosticById, type GameDiagnostic } from '$lib/api/diagnostics';
    import { pressedKeys } from '$lib/app/utils/hotkeys.svelte';
    import { tooltip } from '$lib/app/utils';
    import { boolAttr } from 'runed';
    import dayjs from 'dayjs';

    type Props = {
        open: boolean;
        game: Game;
    };

    let { open = $bindable(), game }: Props = $props();
    const shiftPressed = $derived(pressedKeys.has('Shift'));
    let showHidden = $state(false);

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

    const diagnostics = $derived(game.diagnostics.diagnostics);
    const visibleDiagnostics = $derived(diagnostics.filter(d => !d.dismissed));
    const hiddenDiagnostics = $derived(diagnostics.filter(d => d.dismissed));

    function closeDialog() {
        open = false;
    }

    function dismissSingle(diag: GameDiagnostic) {
        diag.dismissed = true;
    }

    function restoreSingle(diag: GameDiagnostic) {
        diag.dismissed = false;
    }

    function dismissDiagnostic(id: string) {
        game.diagnostics.dismiss(id as any);
    }

    function restoreDiagnostic(id: string) {
        game.diagnostics.restore(id as any);
    }

    function suppressDiagnostic(id: string) {
        game.diagnostics.suppress(id as any);
    }

    function unsuppressDiagnostic(id: string) {
        const idx = game.diagnostics.suppressions.indexOf(id as any);
        if (idx !== -1) {
            game.diagnostics.suppressions.splice(idx, 1);
        }
        restoreDiagnostic(id);
    }

    function clearBtn() {
        if (shiftPressed) {
            game.diagnostics.reset();
        } else if (showHidden) {
            game.diagnostics.restoreAll();
        } else {
            game.diagnostics.dismissAll();
        }
    }
    const visibilityBtnLabel = $derived(showHidden ? "Show active" : "Show hidden");
</script>

<Dialog bind:open>
    {#snippet content(props)}
        {@const activeDiagnostics = showHidden ? hiddenDiagnostics : visibleDiagnostics}
        {@const ShowBtnIcon = showHidden ? Eye : EyeOff}
        <div {...props} class="diagnostics-content">
            <div class="dialog-header">
                <h2 class="text-lg font-bold">Diagnostics ({game.name})</h2>
            </div>

            <div class="dialog-body">
                {#if !activeDiagnostics.length}
                    {@const diagCount = diagnostics.length}
                    <div class="empty-state">
                        <Info class="empty-icon" />
                        <p>No{diagCount ? (showHidden ? ' hidden ' : ' active ') : ' '}diagnostics</p>
                        <p class="text-sm text-neutral-500">
                            {!diagCount
                                ? 'This game is running without any issues.'
                                : `All ${diagCount} diagnostics are ${showHidden ? "active" : "suppressed or dismissed"}. Click "${visibilityBtnLabel}" to show them.`}
                        </p>
                    </div>
                {:else}
                    <div class="diagnostics-list">
                        <!-- lesson learned: don't use arrays as #each keys... ([] != []) -->
                        {#each activeDiagnostics as diag (`${diag.id}:${diag.timestamp}`)}
                            {@const def = getDiagnosticById(diag.id)!}
                            {@const config = severityConfig[def.severity]}
                            {@const Icon = config.icon}
                            
                            {@const isDismissed = diag.dismissed}
                            {@const isSuppressed = game.diagnostics.isSuppressed(diag.id as any)}

                            {@const Btn1Icon = isDismissed ? Undo : Check}
                            {@const Btn2Icon = isDismissed ? Undo2 : CheckCheck}
                            {@const Btn3Icon = isSuppressed ? Eye : EyeOff}
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
                                </div>
                                <div class="actions">
                                    <button class="action-btn"
                                        onclick={() => isDismissed ? restoreSingle(diag) : dismissSingle(diag)}
                                        {@attach tooltip((isDismissed ? "Restore" : "Dismiss") + " this diagnostic")}
                                        >
                                        <Btn1Icon size="16" />
                                    </button>
                                    <button class="action-btn"
                                        onclick={() => isDismissed ? restoreDiagnostic(diag.id) : dismissDiagnostic(diag.id)}
                                        {@attach tooltip((isDismissed ? "Restore" : "Dismiss") + " all current diagnostics of this kind")}
                                    >
                                        <Btn2Icon size="16" />
                                    </button>
                                    <button class={["action-btn", isSuppressed ? "unsuppress" : "suppress"]}
                                        onclick={() => isSuppressed ? unsuppressDiagnostic(diag.id) : suppressDiagnostic(diag.id)}
                                        {@attach tooltip((isSuppressed ? "Show" : "Never show") + " this diagnostic kind again")}
                                    >
                                        <Btn3Icon size="16" />
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <div class="dialog-footer">
                <div class="footer-actions">
                    <button
                        class="btn preset-tonal-surface"
                        onclick={() => showHidden = !showHidden}
                    >
                        <ShowBtnIcon size="16" />
                        <span>{visibilityBtnLabel}</span>
                    </button>
                    <button
                        class={['btn', shiftPressed ? "preset-tonal-warning" : "preset-tonal-surface"]}
                        onclick={() => clearBtn()}
                        disabled={activeDiagnostics.length === 0}
                    >
                        {shiftPressed ? "Clear" : showHidden ? "Restore" : "Dismiss"} all
                    </button>
                </div>
                <button class="btn preset-tonal-surface" onclick={() => closeDialog()}>Close</button>
            </div>
        </div>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .diagnostics-content {
        @apply flex flex-col gap-4 p-5 text-sm;
        @apply min-w-lg max-w-[95vw] max-h-[80vh] overflow-hidden;
        @apply bg-white dark:bg-surface-900 rounded-2xl shadow-2xl;
        @apply text-neutral-900 dark:text-neutral-50;
    }

    .dialog-header {
        @apply flex items-center justify-between pb-2;
        @apply border-b border-neutral-200 dark:border-neutral-700;
    }

    .footer-actions {
        @apply flex items-center gap-2;
    }

    .dialog-body {
        @apply flex flex-col gap-3 flex-1 overflow-hidden;
    }

    .empty-state {
        @apply flex flex-col items-center justify-center gap-3 py-12;
        @apply text-neutral-500 dark:text-neutral-400;
    }

    .empty-icon {
        @apply w-12 h-12 text-neutral-400 dark:text-neutral-600;
    }

    .diagnostics-list {
        @apply flex flex-col gap-2 overflow-y-auto;
        @apply pr-1;
    }

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

    .dialog-footer {
        @apply flex items-center justify-between w-full pt-2 gap-2;
        @apply border-t border-neutral-200 dark:border-neutral-700;
    }

    .btn {
        @apply inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium;
        @apply transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400;
    }
</style>
