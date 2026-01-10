<script lang="ts">
    import Dialog from '$lib/ui/common/Dialog.svelte';
    import TeachingTooltip from '$lib/ui/common/TeachingTooltip.svelte';
    import ShiftIndicator from '$lib/ui/common/ShiftIndicator.svelte';
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
    {#snippet title()}
        <h3>Diagnostics ({game.name})</h3>
        <div class="header-actions">
            <ShiftIndicator />
            <TeachingTooltip>
                <p>Diagnostics help catch common off-spec behaviors in game integrations.</p>
                <p><b>Dismissing</b> a diagnostic instance hides it. Future diagnostics are still visible.</p>
                <p><b>Suppressing</b> hides current and future diagnostics of the same type for this game (specifically, game <em>name</em>).</p>
                <p><Hotkey>Shift</Hotkey>-click "Dismiss all" to clear all diagnostics (this will <b>delete</b>, not dismiss!).</p>
            </TeachingTooltip>
        </div>
    {/snippet}
    {#snippet body()}
        <div class="dialog-body-scroll">
            {#if diagnostics.length}
            <div class="vis-filter">
                <SegmentedControl
                    value={filterValue}
                    onValueChange={(details) => showHidden = details.value === 'hidden'}
                >
                    <SegmentedControl.Control>
                        <SegmentedControl.Indicator class="indicator" />
                        <SegmentedControl.Item value="active">
                            <SegmentedControl.ItemText>Active ({visibleDiagnostics.length})</SegmentedControl.ItemText>
                            <SegmentedControl.ItemHiddenInput />
                        </SegmentedControl.Item>
                        <SegmentedControl.Item value="hidden">
                            <SegmentedControl.ItemText>Hidden ({hiddenDiagnostics.length})</SegmentedControl.ItemText>
                            <SegmentedControl.ItemHiddenInput />
                        </SegmentedControl.Item>
                    </SegmentedControl.Control>
                </SegmentedControl>
            </div>
        {/if}
        <div class="diagnostics-list">
            {#each activeDiagnostics as diag (diag.id)}
                <DiagnosticRow {game} {diag} />
            {:else}
                {@const diagCount = diagnostics.length}
                {@const OKIcon = diagCount ? Info : Check}
                <div class="empty-state">
                    <OKIcon />
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
    {/snippet}
    {#snippet footer()}
        <div class="footer-actions">
            <button
                class={['btn', 'btn-base', showClearBtn ? "preset-tonal-warning" : "preset-tonal-surface"]}
                onclick={clearBtn}
                disabled={!activeDiagnostics.length}
                {@attach tooltip(showClearBtn ? "This will permanently remove all diagnostics!" : "")}
            >
                {showClearBtn ? "Clear" : showHidden ? "Restore" : "Dismiss"} all
            </button>
        </div>
        <button class="btn btn-base preset-tonal-surface" onclick={closeDialog}>Close</button>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .dialog-body-scroll {
        @apply flex flex-col gap-3;
        @apply flex-1 overflow-y-auto;
    }

    .footer-actions {
        @apply flex items-center gap-2;
    }

    .vis-filter :global(.indicator) {
        @apply contrast-50 dark:contrast-75;
    }

    .empty-state {
        @apply flex flex-col items-center justify-center gap-3 py-12;
        @apply text-neutral-500 dark:text-neutral-400;
    }

    .diagnostics-list {
        @apply flex flex-col gap-2 overflow-y-auto;
        @apply pr-1;
    }
</style>
