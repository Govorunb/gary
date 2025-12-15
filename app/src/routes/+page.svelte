<script lang="ts">
import GaryDashboard from "$lib/ui/app/GaryDashboard.svelte";
import PowerButton from "$lib/ui/app/PowerButton.svelte";
import EngineControls from "$lib/ui/app/engines/EngineControls.svelte";
import ManualSendDialog from "$lib/ui/app/ManualSendDialog.svelte";
import RawMessageDialog from "$lib/ui/app/RawMessageDialog.svelte";
import UpdateDialog from "$lib/ui/app/UpdateDialog.svelte";
import SettingsDialog from "$lib/ui/app/SettingsDialog.svelte";
    import { Settings2 } from "@lucide/svelte";
    import { getUIState, getUpdater, getUserPrefs } from "$lib/app/utils/di";
    import { registerAppHotkey } from "$lib/app/utils/hotkeys.svelte";
    import { onMount } from "svelte";
    import type { Update } from "@tauri-apps/plugin-updater";
    
    const uiState = getUIState();
    const dialogs = uiState.dialogs;
    const updater = getUpdater();
    const userPrefs = getUserPrefs();

    let manualSendOpen = $derived(!!dialogs.manualSendDialog);
    let rawMsgOpen = $derived(!!dialogs.rawMessageDialog);
    let updateOpen = $derived(dialogs.updateDialogOpen);
    let settingsOpen = $derived(dialogs.settingsDialogOpen);
    
    onMount(() => {
        const settingsHotkey = registerAppHotkey(["Control", ","], () => {
            if (!dialogs.settingsDialogOpen)
                dialogs.openSettingsDialog();
            else
                dialogs.closeSettingsDialog();
        });

        return () => {
            settingsHotkey();
        }
    });
    async function update() {
        await updater.promptForUpdate();
    }
</script>

<header>
    <div class="justify-self-start">
        <PowerButton />
    </div>
    <div class="justify-self-center">
        <EngineControls />
    </div>
    <div class="justify-self-end flex flex-row gap-4">
        {#if updater.hasPendingUpdate}
            <button class="btn preset-outlined-primary-200-800 align-top" onclick={update}>
                Update to {updater.update?.version ?? "latest version"}
            </button>
        {/if}
        <button 
            class="btn preset-ghost hover:bg-neutral-200 dark:hover:bg-neutral-700 p-2" 
            onclick={() => dialogs.openSettingsDialog()}
            title="Settings"
        >
            <Settings2 class="size-5" />
        </button>
    </div>
</header>
<main>
    <GaryDashboard />
</main>

{#if dialogs.manualSendDialog}
    <ManualSendDialog
        {...dialogs.manualSendDialog}
        bind:open={manualSendOpen}
    />
{/if}

{#if dialogs.rawMessageDialog}
    <RawMessageDialog 
        {...dialogs.rawMessageDialog}
        bind:open={rawMsgOpen}
    />
{/if}

{#if dialogs.updateDialogOpen && updater.update}
    <UpdateDialog bind:open={updateOpen} />
{/if}

{#if dialogs.settingsDialogOpen}
    <SettingsDialog bind:open={settingsOpen} />
{/if}

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
</style>
