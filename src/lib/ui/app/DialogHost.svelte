<script lang="ts">
    import { getUIState, getUpdater } from "$lib/app/utils/di";
    import DiagnosticsDialog from "./DiagnosticsDialog.svelte";
    import ManualSendDialog from "./ManualSendDialog.svelte";
    import RawMessageDialog from "./RawMessageDialog.svelte";
    import SettingsDialog from "./SettingsDialog.svelte";
    import UpdateDialog from "./UpdateDialog.svelte";

    const dialogs = getUIState().dialogs;
    const updater = getUpdater();
    const activeDialog = $derived(dialogs.activeDialog);
</script>

{#if activeDialog?.type === "manualSend"}
    <ManualSendDialog
        action={activeDialog.action}
        game={activeDialog.game}
        bind:open={() => true, (open) => !open && dialogs.closeDialog("manualSend")}
    />
{:else if activeDialog?.type === "rawMessage"}
    <RawMessageDialog
        game={activeDialog.game}
        bind:open={() => true, (open) => !open && dialogs.closeDialog("rawMessage")}
    />
{:else if activeDialog?.type === "diagnostics"}
    <DiagnosticsDialog
        game={activeDialog.game}
        bind:open={() => true, (open) => !open && dialogs.closeDialog("diagnostics")}
    />
{:else if activeDialog?.type === "update" && updater.update}
    <UpdateDialog bind:open={() => true, (open) => !open && dialogs.closeDialog("update")} />
{:else if activeDialog?.type === "settings"}
    <SettingsDialog bind:open={() => true, (open) => !open && dialogs.closeDialog("settings")} />
{/if}
