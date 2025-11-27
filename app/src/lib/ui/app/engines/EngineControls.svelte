<script lang="ts">
    import EnginePicker from "./EnginePicker.svelte";
    import { getSession } from "$lib/app/utils/di";
    import { PressedKeys } from "runed";
    import { HandFist, Pointer, Pause, BugPlay, Play } from "@lucide/svelte";
    import { tooltip } from "$lib/app/utils";

    type State = "errored" | "muted" | "unmuted";

    const session = getSession();
    const scheduler = $derived(session.scheduler);
    const keys = new PressedKeys();
    const shiftPressed = $derived(keys.has('Shift'));

    function userInteracted() {
        scheduler.clearError();
    }

    function poke(force: boolean) {
        userInteracted();
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
            tooltip: "Clear error pause"
        },
        muted: {
            icon: Play,
            tooltip: "Unpause engine"
        },
        unmuted: {
            icon: Pause,
            tooltip: "Pause engine"
        }
    }

    const MuteIcon = $derived(machine[state].icon);
    const muteTooltip = $derived(machine[state].tooltip);
</script>

<div class="engine-controls">
    <EnginePicker />
    <button 
        onclick={toggleMute}
        class="act-btn mute-btn"
        class:muted={scheduler.muted}
        class:errored={scheduler.errored}
        {@attach tooltip(muteTooltip)}
    >
        <MuteIcon />
    </button>
    <button 
        onclick={() => poke(shiftPressed)} 
        class="act-btn"
        {@attach tooltip(shiftPressed ? "Force Act" : "Act (Shift for Force)")}
    >
        {#if shiftPressed}
            <HandFist />
        {:else}
            <Pointer />
        {/if}
    </button>
</div>

<style lang="postcss">
    @reference "global.css";

    .engine-controls {
        @apply flex flex-row items-center gap-3;
    }

    .act-btn {
        @apply p-2 rounded-lg transition-all;
        @apply bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300;
        @apply dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:active:bg-neutral-600;
        @apply border border-neutral-200/50 dark:border-neutral-700/50;
        @apply shadow-sm;
        
        &:focus-visible {
            @apply ring-2 ring-primary-500 outline-none;
        }
    }

    .mute-btn.muted {
        @apply text-warning-600 dark:text-warning-400;
        
        &:hover {
            @apply text-warning-700 dark:text-warning-300;
        }
    }
    .mute-btn.errored {
        @apply text-error-600 dark:text-error-400;
        @apply ring-2 ring-error-200 dark:ring-error-800;
        
        &:hover {
            @apply text-error-700 dark:text-error-300;
            @apply ring-error-400 dark:ring-error-600;
        }
    }
</style>
