<script lang="ts">
    import EnginePicker from "./EnginePicker.svelte";
    import { getSession, getUIState } from "$lib/app/utils/di";
    import { HandFist, Pointer, Pause, BugPlay, Play, Hourglass, Infinity, Square } from "@lucide/svelte";
    import { tooltip } from "$lib/app/utils";
    import { pressedKeys } from "$lib/app/utils/hotkeys.svelte";
    import { boolAttr } from "runed";

    type State = "errored" | "muted" | "unmuted";

    const session = getSession();
    const scheduler = $derived(session.scheduler);
    const ui = getUIState();
    const altMode = $derived(pressedKeys.has('Shift') && !ui.anyDialogOpen);

    function userInteracted() {
        scheduler.clearError();
    }

    function poke(force: boolean) {
        userInteracted();
        if (scheduler.busy) return;
        if (force) {
            scheduler.forceAct();
        } else {
            scheduler.tryAct();
        }
    }

    function toggleMute() {
        if (!scheduler.errored) {
            scheduler.toggleMuted();
        }
        userInteracted();
    }

    function getState(): State {
        if (scheduler.errored) {
            return "errored";
        }
        return scheduler.muted ? "muted" : "unmuted";
    }

    const state = $derived(getState());
    const machine = {
        errored: {
            icon: BugPlay,
            text: "Resume",
            tooltip: "Clear error pause"
        },
        muted: {
            icon: Play,
            text: "Resume",
            tooltip: "Unpause engine"
        },
        unmuted: {
            icon: Pause,
            text: "Pause",
            tooltip: "Pause engine"
        }
    }

    const MuteIcon = $derived(machine[state].icon);
    const muteTooltip = $derived(machine[state].tooltip);
    const muteText = $derived(machine[state].text);
    const showStopIcon = $derived(scheduler.busy && altMode);
    const showBusyIcon = $derived(scheduler.busy && !altMode);
    const showForceIcon = $derived(!scheduler.busy && altMode);
    const showActIcon = $derived(!scheduler.busy && !altMode);
</script>

<div class="engine-controls">
    <EnginePicker />
    <button
        onclick={toggleMute}
        class="act-btn mute-btn"
        data-muted={boolAttr(scheduler.muted)}
        data-errored={boolAttr(scheduler.errored)}
        {@attach tooltip(muteTooltip)}
    >
        <MuteIcon />
        <span class="not-md:hidden">{muteText}</span>
    </button>
    <button
        onclick={() => {
            if (scheduler.busy && altMode) {
                scheduler.cancelAct();
            } else {
                poke(altMode);
            }
        }}
        class="act-btn frow-2"
        disabled={scheduler.busy && !altMode}
        {@attach tooltip(
            scheduler.busy
                ? (altMode ? "Stop" : "Engine busy (Shift to stop)")
                : (altMode ? "Force Act" : "Act (Shift for Force)")
        )}
    >
        <span class="act-icon-slot" aria-hidden="true">
            <!-- Keep every icon mounted so the busy animation retains its phase between state changes. -->
            <Square class="act-icon" data-visible={boolAttr(showStopIcon)} />
            <Hourglass class="act-icon animate-[spin_2s_ease-in-out_infinite,pulse_4s_linear_infinite]" data-visible={boolAttr(showBusyIcon)} />
            <HandFist class="act-icon" data-visible={boolAttr(showForceIcon)} />
            <Pointer class="act-icon" data-visible={boolAttr(showActIcon)} />
        </span>
        {#if scheduler.busy}
            {#if altMode}
                <span class="not-md:hidden">Stop</span>
            {:else}
                <span class="not-md:hidden">Busy</span>
            {/if}
        {:else}
            {#if altMode}
                <span class="not-md:hidden">Force act</span>
            {:else}
                <span class="not-md:hidden">Act</span>
            {/if}
        {/if}
    </button>
    <button
        onclick={() => scheduler.autoPoker.autoAct = !scheduler.autoPoker.autoAct}
        class="act-btn autoact-btn"
        {@attach tooltip("Act automatically")}
        data-checked={boolAttr(scheduler.autoPoker.autoAct)}
    >
        <Infinity />
        <span class="not-md:hidden">Auto-act</span>
    </button>
</div>

<style lang="postcss">
    @reference "global.css";
    .engine-controls {
        @apply frow-2 items-center;
    }
    .act-btn {
        @apply frow-1.5 items-center h-8 px-2.5 rounded-md;
        @apply text-sm font-medium text-ink-0 transition-all;
        background-color: var(--color-bar-control);
        & > :global(svg) { @apply size-4; }
        &:hover:not(:disabled) {
            background-color: var(--color-bar-control-hover);
        }
        &:active:not(:disabled) {
            background-color: var(--color-bar-control-hover);
        }
        &:disabled {
            @apply opacity-60;
        }
        &:focus-visible {
            @apply ring-2 ring-accent outline-none;
        }
    }
    .act-icon-slot {
        @apply relative inline-grid size-4 shrink-0 place-items-center;
    }
    .act-icon-slot :global(.act-icon) {
        @apply absolute size-4;
        visibility: hidden;
    }
    .act-icon-slot :global(.act-icon[data-visible]) {
        visibility: visible;
    }
    .mute-btn[data-muted] {
        @apply text-lvl-warn;
    }
    .mute-btn[data-errored] {
        @apply text-lvl-err ring-[1.5px] ring-inset ring-lvl-err;
    }
    .autoact-btn[data-checked] {
        @apply text-accent ring-[1.5px] ring-inset ring-accent;
    }
</style>
