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
    import RadioButtons from '$lib/ui/common/RadioButtons.svelte';

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
        {#if diagnostics.length}
            <div class="vis-filter">
                <RadioButtons
                    items={["Active", "Hidden"]}
                    bind:selectedIndex={() => showHidden ? 1 : 0, (i) => showHidden = i === 1}
                >
                    {#snippet renderItem(item, i)}
                        <span>{item} ({i ? hiddenDiagnostics.length : visibleDiagnostics.length})</span>
                    {/snippet}
                </RadioButtons>
            </div>
        {/if}
        <div class="dialog-scroll diagnostic-list">
            {#each activeDiagnostics as diag (diag.id)}
                <DiagnosticRow {game} {diag} />
            {:else}
                {const diagCount = $derived(diagnostics.length)}
                {const OKIcon = $derived(diagCount ? Info : Check)}
                <div class="fcol-3 empty-state">
                    <OKIcon />
                    <p>No{diagCount ? (showHidden ? ' hidden ' : ' active ') : ' '}diagnostics</p>
                    <p class="text-sm text-ink-3">
                        {!diagCount
                            ? 'This game is running without any issues.'
                            : `All ${diagCount} diagnostic(s) are ${showHidden ? "active" : "suppressed or dismissed"}.`}
                    </p>
                </div>
            {/each}
        </div>
    {/snippet}
    {#snippet footer()}
        <div class="footer-actions">
            <button
                class={['btn', showClearBtn && 'btn-danger']}
                onclick={clearBtn}
                disabled={!activeDiagnostics.length}
                {@attach tooltip(showClearBtn ? "This will permanently remove all diagnostics!" : "")}
            >
                {showClearBtn ? "Clear" : showHidden ? "Restore" : "Dismiss"} all
            </button>
        </div>
        <button class="btn" onclick={closeDialog}>Close</button>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .footer-actions {
        @apply frow-2 items-center;
    }

    .diagnostic-list {
        @apply fcol-0;
        & > :global(* + *) { @apply border-t border-edge; }
    }

    .empty-state {
        @apply items-center justify-center py-12 text-ink-2;
    }
</style>
