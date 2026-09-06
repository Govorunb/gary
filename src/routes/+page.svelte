<script lang="ts">
    import GaryDashboard from "$lib/ui/app/GaryDashboard.svelte";
    import PowerButton from "$lib/ui/app/PowerButton.svelte";
    import EngineControls from "$lib/ui/app/engines/EngineControls.svelte";
    import DialogHost from "$lib/ui/app/DialogHost.svelte";
    import { Settings } from "@lucide/svelte";
    import { getUIState, getUpdater } from "$lib/app/utils/di";
    import { registerAppHotkey } from "$lib/app/utils/hotkeys.svelte";
    const uiState = getUIState();
    const dialogs = uiState.dialogs;
    const updater = getUpdater();

    registerAppHotkey(["Control", ","], () => dialogs.toggleSettingsDialog());
</script>

<header>
    <div class="justify-self-start min-w-0">
        <PowerButton />
    </div>
    <div class="justify-self-center">
        <EngineControls />
    </div>
    <div class="justify-self-end frow-2 items-center">
        {#if updater.hasPendingUpdate}
            <button class="update-btn" onclick={() => updater.promptForUpdate()}>
                Update to {updater.update?.version ?? "latest version"}
            </button>
        {/if}
        <button
            class="icon-btn bar-btn"
            onclick={() => dialogs.openSettingsDialog()}
            title="Settings"
        >
            <Settings class="size-[18px]!" />
        </button>
    </div>
</header>
<main>
    <GaryDashboard />
</main>

<DialogHost />

<style lang="postcss">
    @reference "global.css";

    header {
        @apply relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 h-12 px-2.5 shrink-0;
        @apply bg-bar text-ink-0 select-none;
    }
    .bar-btn {
        @apply size-8;
        &:hover:not(:disabled) {
            background-color: var(--color-bar-control);
        }
    }
    .update-btn {
        @apply h-8 px-3 rounded-md text-sm font-medium text-accent transition-colors;
        background-color: var(--color-bar-control);
        &:hover { background-color: var(--color-bar-control-hover); }
    }
    main {
        @apply flex flex-1 overflow-hidden bg-layer-0;
    }
</style>
