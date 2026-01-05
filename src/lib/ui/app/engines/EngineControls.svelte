<script lang="ts">
    import EnginePicker from "./EnginePicker.svelte";
    import { getSession } from "$lib/app/utils/di";
    import { HandFist, Pointer, Pause, BugPlay, Play, Hourglass, Infinity, Square } from "@lucide/svelte";
    import { tooltip } from "$lib/app/utils";
    import { pressedKeys } from "$lib/app/utils/hotkeys.svelte";
    import { boolAttr } from "runed";

    type State = "errored" | "muted" | "unmuted";

    const session = getSession();
    const scheduler = $derived(session.scheduler);
    const shiftPressed = $derived(pressedKeys.has('Shift'));

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
            scheduler.muted = !scheduler.muted;
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
        <MuteIcon /> {muteText}
    </button>
    <button 
        onclick={() => {
            if (scheduler.busy && shiftPressed) {
                scheduler.cancelAct();
            } else {
                poke(shiftPressed);
            }
        }}
        class="act-btn flex flex-row gap-2"
        disabled={scheduler.busy && !shiftPressed}
        {@attach tooltip(
            scheduler.busy && shiftPressed
                ? "Stop"
                : scheduler.busy
                    ? "Engine busy (Shift to stop)"
                    : shiftPressed
                        ? "Force Act"
                        : "Act (Shift for Force)"
        )}
    >
        {#if scheduler.busy && shiftPressed}
            <Square /> Stop
        {:else if scheduler.busy}
            <Hourglass /> Busy
        {:else if shiftPressed}
            <HandFist /> Force act
        {:else}
            <Pointer /> Act
        {/if}
    </button>
    <button
        onclick={() => scheduler.autoPoker.autoAct = !scheduler.autoPoker.autoAct}
        class="act-btn autoact-btn"
        {@attach tooltip("Act automatically")}
        data-checked={boolAttr(scheduler.autoPoker.autoAct)}
    >
        <Infinity /> Auto-act
    </button>
</div>

<style lang="postcss">
    @reference "global.css";

    .engine-controls {
        @apply flex flex-row items-center gap-3;
    }

    .act-btn {
        @apply flex flex-row gap-2;
        @apply font-semibold text-base;
        @apply p-2 rounded-lg transition-all;
        @apply bg-neutral-100 dark:bg-neutral-800;
        @apply border border-neutral-200/50 dark:border-neutral-700/50;
        @apply shadow-sm;

        &:hover:not(:disabled) {
            @apply bg-neutral-200 dark:bg-neutral-700;
        }
        &:active:not(:disabled) {
            @apply bg-neutral-300 dark:bg-neutral-600;
        }
        &:disabled {
            @apply opacity-60;
        }
        
        &:focus-visible {
            @apply ring-2 ring-primary-500 outline-none;
        }
    }

    .mute-btn[data-muted] {
        @apply text-warning-600 dark:text-warning-400;
        
        &:hover {
            @apply text-warning-700 dark:text-warning-300;
        }
    }
    .mute-btn[data-errored] {
        @apply text-error-600 dark:text-error-400;
        @apply ring-2 ring-error-200 dark:ring-error-800;
        
        &:hover {
            @apply text-error-700 dark:text-error-300;
            @apply ring-error-400 dark:ring-error-600;
        }
    }

    .autoact-btn {
        @apply transition-all;
        &[data-checked] {
            @apply ring-3 ring-inset ring-primary-200 dark:ring-primary-500;
            @apply text-secondary-700 dark:text-secondary-200;
        }
        &:active {
            @apply ring-2 ring-inset ring-primary-300 dark:ring-primary-700;
        }
    }

</style>
