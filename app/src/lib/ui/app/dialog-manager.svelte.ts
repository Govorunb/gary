import type { Action } from "$lib/api/v1/spec";
import type { Game } from "$lib/api/registry.svelte";

export type ManualSendDialogState = null | { action: Action, game: Game };
export type RawMessageDialogState = null | { game: Game };

export class DialogManager {
    manualSendDialog: ManualSendDialogState = $state(null);
    rawMessageDialog: RawMessageDialogState = $state(null);
    enginePickerOpen: boolean = $state(false);
    settingsDialogOpen: boolean = $state(false);

    anyDialogOpen = $derived(!!(this.manualSendDialog || this.rawMessageDialog || this.enginePickerOpen || this.settingsDialogOpen));

    openManualSendDialog(action: Action, game: Game) {
        this.closeAllDialogs();
        this.manualSendDialog = { action, game };
    }

    closeManualSendDialog() {
        this.manualSendDialog = null;
    }

    openRawMessageDialog(game: Game) {
        this.closeAllDialogs();
        this.rawMessageDialog = { game };
    }

    closeRawMessageDialog() {
        this.rawMessageDialog = null;
    }

    openEnginePicker() {
        this.closeAllDialogs();
        this.enginePickerOpen = true;
    }

    closeEnginePicker() {
        this.enginePickerOpen = false;
    }

    openSettingsDialog() {
        this.closeAllDialogs();
        this.settingsDialogOpen = true;
    }

    closeSettingsDialog() {
        this.settingsDialogOpen = false;
    }

    closeAllDialogs() {
        this.manualSendDialog = null;
        this.rawMessageDialog = null;
        this.enginePickerOpen = false;
        this.settingsDialogOpen = false;
    }
}