import type { Action } from "$lib/api/v1/spec";
import type { Game } from "$lib/api/game.svelte";

export type ManualSendDialogState = null | { action: Action, game: Game };
export type RawMessageDialogState = null | { game: Game };
export type DiagnosticsDialogState = null | { game: Game };

export class DialogManager {
    manualSendDialog: ManualSendDialogState = $state(null);
    rawMessageDialog: RawMessageDialogState = $state(null);
    diagnosticsDialog: DiagnosticsDialogState = $state(null);
    updateDialogOpen: boolean = $state(false);
    enginePickerOpen: boolean = $state(false);
    settingsDialogOpen: boolean = $state(false);
    prefsLoadErrorOpen: boolean = $state(false);

    blockingDialogOpen = $derived(!!(this.prefsLoadErrorOpen));
    anyDialogOpen = $derived(!!(this.manualSendDialog
        || this.rawMessageDialog
        || this.diagnosticsDialog
        || this.updateDialogOpen
        || this.enginePickerOpen
        || this.settingsDialogOpen
        || this.prefsLoadErrorOpen
    ));

    openManualSendDialog(action: Action, game: Game) {
        this.closeAllDialogs();
        if (!this.prefsLoadErrorOpen)
            this.manualSendDialog = { action, game };
    }

    closeManualSendDialog() {
        this.manualSendDialog = null;
    }

    openRawMessageDialog(game: Game) {
        this.closeAllDialogs();
        if (!this.prefsLoadErrorOpen)
            this.rawMessageDialog = { game };
    }

    closeRawMessageDialog() {
        this.rawMessageDialog = null;
    }

    openDiagnosticsDialog(game: Game) {
        this.closeAllDialogs();
        if (!this.prefsLoadErrorOpen)
            this.diagnosticsDialog = { game };
    }

    closeDiagnosticsDialog() {
        this.diagnosticsDialog = null;
    }

    openUpdateDialog() {
        this.closeAllDialogs();
        if (!this.prefsLoadErrorOpen)
            this.updateDialogOpen = true;
    }

    closeUpdateDialog() {
        this.updateDialogOpen = false;
    }

    openEnginePicker() {
        this.closeAllDialogs();
        if (!this.prefsLoadErrorOpen)
            this.enginePickerOpen = true;
    }

    closeEnginePicker() {
        this.enginePickerOpen = false;
    }

    openSettingsDialog() {
        this.closeAllDialogs();
        if (!this.prefsLoadErrorOpen)
            this.settingsDialogOpen = true;
    }

    closeSettingsDialog() {
        this.settingsDialogOpen = false;
    }

    closeAllDialogs() {
        this.manualSendDialog = null;
        this.rawMessageDialog = null;
        this.diagnosticsDialog = null;
        this.updateDialogOpen = false;
        this.enginePickerOpen = false;
        this.settingsDialogOpen = false;
    }
}