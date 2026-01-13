<script lang="ts">
    import GaryDashboard from "$lib/ui/app/GaryDashboard.svelte";
    import PowerButton from "$lib/ui/app/PowerButton.svelte";
    import EngineControls from "$lib/ui/app/engines/EngineControls.svelte";
    import ManualSendDialog from "$lib/ui/app/ManualSendDialog.svelte";
    import RawMessageDialog from "$lib/ui/app/RawMessageDialog.svelte";
    import DiagnosticsDialog from "$lib/ui/app/DiagnosticsDialog.svelte";
    import UpdateDialog from "$lib/ui/app/UpdateDialog.svelte";
    import SettingsDialog from "$lib/ui/app/SettingsDialog.svelte";
    import { Settings } from "@lucide/svelte";
    import { getUIState, getUpdater, getUserPrefs } from "$lib/app/utils/di";
    import { registerAppHotkey } from "$lib/app/utils/hotkeys.svelte";
    import { onMount } from "svelte";

    const uiState = getUIState();
    const dialogs = uiState.dialogs;
    const updater = getUpdater();

    let manualSendOpen = $derived(!!dialogs.manualSendDialog);
    let rawMsgOpen = $derived(!!dialogs.rawMessageDialog);
    let diagnosticsOpen = $derived(!!dialogs.diagnosticsDialog);
    let updateOpen = $derived(dialogs.updateDialogOpen);
    let settingsOpen = $derived(dialogs.settingsDialogOpen);

    $effect(() => {
        if (!manualSendOpen) {
            dialogs.closeManualSendDialog();
        }
        if (!rawMsgOpen) {
            dialogs.closeRawMessageDialog();
        }
        if (!diagnosticsOpen) {
            dialogs.closeDiagnosticsDialog();
        }
        if (!updateOpen) {
            dialogs.closeUpdateDialog();
        }
        if (!settingsOpen) {
            dialogs.closeSettingsDialog();
        }
    })

    onMount(() => {
        const settingsHotkey = registerAppHotkey(["Control", ","], () => {
            if (dialogs.settingsDialogOpen) {
                dialogs.closeSettingsDialog();
            } else {
                dialogs.openSettingsDialog();
            }
        });

        return () => {
            settingsHotkey();
        }
    });
</script>

<header>
    <div class="justify-self-start">
        <PowerButton />
    </div>
    <div class="justify-self-center">
        <EngineControls />
    </div>
    <div class="justify-self-end frow-4">
        {#if updater.hasPendingUpdate}
            <button class="btn preset-outlined-primary-200-800 align-top" onclick={() => updater.promptForUpdate()}>
                Update to {updater.update?.version ?? "latest version"}
            </button>
        {/if}
         <button
             class="btn p-2 hover:bg-surface-500/20"
             onclick={() => dialogs.openSettingsDialog()}
             title="Settings"
         >
            <Settings class="size-5" />
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

{#if dialogs.diagnosticsDialog}
    <DiagnosticsDialog
        {...dialogs.diagnosticsDialog}
        bind:open={diagnosticsOpen}
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
