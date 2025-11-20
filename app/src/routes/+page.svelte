<script lang="ts">
    import GaryDashboard from "$lib/ui/app/GaryDashboard.svelte";
    import ThemePicker from "$lib/ui/common/ThemePicker.svelte";
    import PowerButton from "$lib/ui/app/PowerButton.svelte";
    import EnginePicker from "$lib/ui/app/EnginePicker.svelte";
    import { getSession } from "$lib/app/utils/di";
    import { PressedKeys } from "runed";
    import { HandFist, Pointer, MonitorPlay, MonitorPause, MonitorX } from "@lucide/svelte";
    import { tooltip } from "$lib/app/utils";

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

    const MuteIcon = $derived.by(() => {
        if (scheduler.errored) {
            return MonitorX;
        }
        return scheduler.muted ? MonitorPause : MonitorPlay;
    });
    const muteTooltip = $derived.by(() => {
        if (scheduler.errored) {
            return "Clear error pause"; 
        }
        return scheduler.muted ? "Unpause engine" : "Pause engine";
    });
</script>

<header>
    <div class="justify-self-start">
        <PowerButton />
    </div>
    <h1 class="page-title">
        <EnginePicker />
        {#if session.activeEngine}
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
        {/if}
    </h1>
    <div class="justify-self-end">
        <ThemePicker />
    </div>
</header>
<main>
    <GaryDashboard />
</main>

<style lang="postcss">
    @reference "global.css";

    header {
        @apply grid grid-cols-[1fr_auto_1fr] items-center gap-1 px-4 py-3;
        @apply bg-primary-200 dark:bg-primary-900;
        @apply text-neutral-900 dark:text-neutral-100;
    }
    main {
        @apply flex flex-1 overflow-hidden;
        @apply bg-surface-100 dark:bg-surface-900;
    }
    .page-title {
        @apply justify-self-center flex flex-row items-center gap-3;
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