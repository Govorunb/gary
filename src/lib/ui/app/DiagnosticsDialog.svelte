<script lang="ts">
    import Dialog from '$lib/ui/common/Dialog.svelte';
    import TeachingTooltip from '$lib/ui/common/TeachingTooltip.svelte';
    import type { Game } from "$lib/api/game.svelte";
    import { Info, Check } from '@lucide/svelte';
    import { pressedKeys } from '$lib/app/utils/hotkeys.svelte';
    import DiagnosticRow from './DiagnosticRow.svelte';
    import Hotkey from '../common/Hotkey.svelte';
    import { tooltip } from '$lib/app/utils';
    import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';

    type Props = {
        open: boolean;
        game: Game;
    };

    let { open = $bindable(), game }: Props = $props();
    const shiftPressed = $derived(pressedKeys.has('Shift'));
    let showHidden = $state(false);

    const diagnostics = $derived(game.diagnostics.diagnostics);
    const visibleDiagnostics = $derived(diagnostics.filter(d => !d.dismissed));
    const hiddenDiagnostics = $derived(diagnostics.filter(d => d.dismissed));
    const activeDiagnostics = $derived(showHidden ? hiddenDiagnostics : visibleDiagnostics);
    const inactiveDiagnostics = $derived(showHidden ? visibleDiagnostics : hiddenDiagnostics);

    const showClearBtn = $derived(activeDiagnostics.length && shiftPressed);

    function closeDialog() {
        open = false;
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
    const filterValue = $derived(showHidden ? 'hidden' : 'active');
</script>

<Dialog bind:open>
    {#snippet content(props)}
        <div {...props} class="diagnostics-content">
            <div class="dialog-header">
                <h2 class="text-lg font-bold">Diagnostics ({game.name})</h2>
                <TeachingTooltip>
                    <p>Diagnostics help catch common off-spec behaviors in game integrations.</p>
                    <p><b>Dismissing</b> a diagnostic instance hides it. Future diagnostics are still visible.</p>
                    <p><b>Suppressing</b> hides current and future diagnostics of the same type for this game (specifically, game <em>name</em>).</p>
                    <p><Hotkey>Shift</Hotkey>-click "Dismiss all" to clear all diagnostics (this will <b>delete</b>, not dismiss!).</p>
                </TeachingTooltip>
            </div>

            <div class="dialog-body">
                {#if diagnostics.length}
                    <SegmentedControl
                        value={filterValue}
                        onValueChange={(details) => showHidden = details.value === 'hidden'}
                        disabled={diagnostics.length === 0}
                    >
                        <SegmentedControl.Control>
                            <SegmentedControl.Indicator class="indicator" />
                            <SegmentedControl.Item value="active">
                                <SegmentedControl.ItemText>Active</SegmentedControl.ItemText>
                                <SegmentedControl.ItemHiddenInput />
                            </SegmentedControl.Item>
                            <SegmentedControl.Item value="hidden">
                                <SegmentedControl.ItemText>Hidden</SegmentedControl.ItemText>
                                <SegmentedControl.ItemHiddenInput />
                            </SegmentedControl.Item>
                        </SegmentedControl.Control>
                    </SegmentedControl>
                {/if}
                <div class="diagnostics-list">
                    {#each activeDiagnostics as diag (`${diag.id}:${diag.timestamp}`)}
                        <DiagnosticRow {game} {diag} {shiftPressed} />
                    {:else}
                        {@const diagCount = diagnostics.length}
                        {@const OKIcon = diagCount ? Info : Check}
                        <div class="empty-state">
                            <OKIcon class="empty-icon" />
                            <p>No{diagCount ? (showHidden ? ' hidden ' : ' active ') : ' '}diagnostics</p>
                            <p class="text-sm text-neutral-500">
                                {!diagCount
                                    ? 'This game is running without any issues.'
                                    : `All ${diagCount} diagnostic(s) are ${showHidden ? "active" : "suppressed or dismissed"}.`}
                            </p>
                        </div>
                    {/each}
                </div>
            </div>

            <div class="dialog-footer">
                <div class="footer-actions">
                    <button
                        class={['btn', showClearBtn ? "preset-tonal-warning" : "preset-tonal-surface"]}
                        onclick={() => clearBtn()}
                        disabled={!activeDiagnostics.length}
                        {@attach tooltip(showClearBtn ? "This will permanently remove all diagnostics!" : "")}
                    >
                        {showClearBtn ? "Clear" : showHidden ? "Restore" : "Dismiss"} all
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
        & :global(.indicator) {
            @apply contrast-50 dark:contrast-75;
        }
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

    .dialog-footer {
        @apply flex items-center justify-between w-full pt-2 gap-2;
        @apply border-t border-neutral-200 dark:border-neutral-700;
    }

    .btn {
        @apply inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium;
        @apply transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400;
    }
</style>
