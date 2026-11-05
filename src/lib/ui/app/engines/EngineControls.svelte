<script lang="ts">
    import EnginePicker from "./EnginePicker.svelte";
    import AutoActIntervals from "./AutoActIntervals.svelte";
    import Popover from "#lib/ui/common/Popover.svelte";
    import { getSession, getUIState } from "#lib/app/utils/di.js";
    import { HandFist, Pointer, Pause, BugPlay, Play, Hourglass, Infinity as InfinityIcon, Square, ChevronDown } from "@lucide/svelte";
    import { tooltip } from "#lib/app/utils/index.js";
    import { pressedKeys } from "#lib/app/utils/hotkeys.svelte.js";
    import { boolAttr } from "runed";
    import { COMMANDS, canRun } from "#lib/app/commands.js";

    type State = "errored" | "muted" | "unmuted";

    const session = getSession();
    const scheduler = $derived(session.scheduler);
    const ui = getUIState();
    const altMode = $derived(pressedKeys.has('Shift') && !ui.anyDialogOpen);

    function toggleMute() {
        // resuming from an error pause leaves the user's own pause as it was
        const paused = scheduler.errored ? scheduler.muted : !scheduler.muted;
        void session.run(COMMANDS.setPaused, { paused });
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
    const clickStops = $derived(scheduler.busy && altMode);
    const showBusyIcon = $derived(scheduler.busy && !altMode);
    const showForceIcon = $derived(!scheduler.busy && altMode);
    const showActIcon = $derived(!scheduler.busy && !altMode);
    const autoActTooltip = $derived.by(() => {
        const { tryInterval, forceInterval } = session.userPrefs.app.autoAct;
        return `Act automatically (every ${tryInterval / 1000}s, force after ${forceInterval / 1000}s)`;
    });
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
        onclick={() => void (clickStops ? session.run(COMMANDS.stopAct, {}) : session.run(COMMANDS.act, { force: altMode }))}
        class="act-btn frow-2"
        disabled={!canRun(session, clickStops ? COMMANDS.stopAct : COMMANDS.act)}
        {@attach tooltip(
            scheduler.busy
                ? (altMode ? "Stop" : "Engine busy (Shift to stop)")
                : (altMode ? "Force Act" : "Act (Shift for Force)")
        )}
    >
        <span class="act-icon-slot" aria-hidden="true">
            <!-- Keep every icon mounted so the busy animation retains its phase between state changes. -->
            <Square class="act-icon" data-visible={boolAttr(clickStops)} />
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
    <!-- One control: the toggle, and its timing behind the chevron. -->
    <div class="autoact-split" data-checked={boolAttr(scheduler.autoPoker.autoAct)}>
        <button
            onclick={() => void session.run(COMMANDS.setAutoAct, { enabled: !scheduler.autoPoker.autoAct })}
            class="act-btn autoact-btn"
            aria-pressed={scheduler.autoPoker.autoAct}
            {@attach tooltip(autoActTooltip)}
        >
            <InfinityIcon />
            <span class="not-md:hidden">Auto-act</span>
        </button>
        <Popover>
            {#snippet trigger(props)}
                <button {...props} class="act-btn autoact-timing" aria-label="Auto-act timing" {@attach tooltip("Auto-act timing")}>
                    <ChevronDown />
                </button>
            {/snippet}
            <AutoActIntervals />
        </Popover>
    </div>
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
        @apply text-lvl-err ring-2 ring-inset ring-lvl-err;
    }
    .autoact-split {
        @apply relative frow-0 items-center;
        & > .autoact-btn { @apply rounded-r-none; }
        & > .autoact-timing {
            @apply rounded-l-none px-1.5 text-ink-2;
            border-left: 1px solid color-mix(in oklab, var(--color-ink-0) 12%, transparent);
        }
        /* The ring goes over both segments, so it's drawn on top of their backgrounds. */
        &[data-checked] {
            & > .act-btn { @apply text-accent; }
            &::after {
                content: "";
                @apply absolute inset-0 rounded-md pointer-events-none ring-2 ring-inset ring-accent;
            }
        }
    }
</style>
