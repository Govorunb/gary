<script lang="ts">
    import Dialog from '$lib/ui/common/Dialog.svelte';
    import type { Game } from "$lib/api/game.svelte";
    import { CircleX, Info, Skull, TriangleAlert, X } from '@lucide/svelte';
    import { DIAGNOSTICS, DiagnosticSeverity, getDiagnosticById } from '$lib/api/diagnostics';

    type Props = {
        open: boolean;
        game: Game;
    };

    let { open = $bindable(), game }: Props = $props();

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

    function closeDialog() {
        open = false;
    }

    function dismissDiagnostic(id: string) {
        game.diagnostics.dismissDiagnosticsById(id as any);
    }

    function clearAllDiagnostics() {
        game.diagnostics.clear();
    }
</script>

<Dialog bind:open>
    {#snippet content(props)}
        <div {...props} class="diagnostics-content">
            <div class="dialog-header">
                <h2 class="text-lg font-bold">Diagnostics ({game.name})</h2>
                <div class="header-actions">
                    <button
                        class="btn preset-outlined-error"
                        onclick={clearAllDiagnostics}
                        disabled={diagnostics.length === 0}
                    >
                        Clear All
                    </button>
                </div>
            </div>

            <div class="dialog-body">
                {#if diagnostics.length === 0}
                    <div class="empty-state">
                        <Info class="empty-icon" />
                        <p>No active diagnostics</p>
                        <p class="text-sm text-neutral-500">This game is running without any issues.</p>
                    </div>
                {:else}
                    <div class="diagnostics-list">
                        {#each diagnostics as diag (diag.id)}
                            {@const def = getDiagnosticById(diag.id)!}
                            {@const config = severityConfig[def.severity]}
                            {@const Icon = config.icon}
                            <div class="diagnostic-item {config.class}">
                                <div class="diagnostic-icon">
                                    <Icon />
                                </div>
                                <div class="diagnostic-content">
                                    <div class="diagnostic-header">
                                        <span class="severity-label">{config.label}</span>
                                        <button
                                            class="dismiss-btn"
                                            onclick={() => dismissDiagnostic(diag.id)}
                                            title="Dismiss diagnostic"
                                        >
                                            <X />
                                        </button>
                                    </div>
                                    <p class="diagnostic-message">{def.message}</p>
                                    {#if def.details}
                                        <p class="diagnostic-details">{def.details}</p>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <div class="dialog-footer">
                <button class="btn preset-tonal-surface" onclick={closeDialog}>Close</button>
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

    .header-actions {
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
        @apply flex gap-3 p-3 rounded-lg;
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
    }

    .diagnostic-icon {
        @apply shrink-0 flex items-center justify-center;
    }

    .diagnostic-icon :global(svg) {
        @apply w-5 h-5;
    }

    .diagnostic-icon.severity-error {
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

    .diagnostic-header {
        @apply flex items-center justify-between gap-2;
    }

    .severity-label {
        @apply text-xs font-medium uppercase tracking-wide;
    }

    .severity-label.severity-error {
        @apply text-red-700 dark:text-red-300;
    }

    .severity-label.severity-warning {
        @apply text-amber-700 dark:text-amber-300;
    }

    .severity-label.severity-info {
        @apply text-sky-700 dark:text-sky-300;
    }

    .dismiss-btn {
        @apply p-1 rounded-md;
        @apply text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200;
        @apply transition-colors;
        &:hover {
            @apply bg-neutral-200/50 dark:bg-neutral-700/50;
        }
    }

    .diagnostic-message {
        @apply font-medium;
    }

    .diagnostic-details {
        @apply text-xs text-neutral-600 dark:text-neutral-400;
    }

    .dialog-footer {
        @apply flex items-center justify-end w-full pt-2 gap-2;
        @apply border-t border-neutral-200 dark:border-neutral-700;
    }

    .btn {
        @apply inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium;
        @apply transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400;
    }
</style>
