import type { Action } from "$lib/api/v1/spec";
import type { Game } from "$lib/api/game.svelte";
import type { EngineId } from "./engines/EngineConfig.svelte";

export type ManualSendDialogState = null | { action: Action, game: Game };
export type RawMessageDialogState = null | { game: Game };
export type DiagnosticsDialogState = null | { game: Game };

export class DialogManager {
    manualSendDialog: ManualSendDialogState = $state(null);
    rawMessageDialog: RawMessageDialogState = $state(null);
    diagnosticsDialog: DiagnosticsDialogState = $state(null);
    updateDialogOpen: boolean = $state(false);
    enginePickerState: boolean | string = $state(false); // false -> closed, open -> picker (no engine selected), string (engine id) -> config
    settingsDialogOpen: boolean = $state(false);
    prefsLoadErrorOpen: boolean = $state(false);

    blockingDialogOpen = $derived(!!(this.prefsLoadErrorOpen));
    anyDialogOpen = $derived(!!(this.manualSendDialog
        || this.rawMessageDialog
        || this.diagnosticsDialog
        || this.updateDialogOpen
        || this.enginePickerState
        || this.settingsDialogOpen
        || this.prefsLoadErrorOpen
    ));

    openManualSendDialog(action: Action, game: Game) {
        this.closeAllDialogs();
        if (!this.blockingDialogOpen)
            this.manualSendDialog = { action, game };
    }

    closeManualSendDialog() {
        this.manualSendDialog = null;
    }

    openRawMessageDialog(game: Game) {
        this.closeAllDialogs();
        if (!this.blockingDialogOpen)
            this.rawMessageDialog = { game };
    }

    closeRawMessageDialog() {
        this.rawMessageDialog = null;
    }

    openDiagnosticsDialog(game: Game) {
        this.closeAllDialogs();
        if (!this.blockingDialogOpen)
            this.diagnosticsDialog = { game };
    }

    closeDiagnosticsDialog() {
        this.diagnosticsDialog = null;
    }

    openUpdateDialog() {
        this.closeAllDialogs();
        if (!this.blockingDialogOpen)
            this.updateDialogOpen = true;
    }

    closeUpdateDialog() {
        this.updateDialogOpen = false;
    }

    openEnginePicker() {
        this.closeAllDialogs();
        if (!this.blockingDialogOpen)
            this.enginePickerState = true;
    }

    openEngineConfig(engineId: EngineId) {
        this.closeAllDialogs();
        if (!this.blockingDialogOpen)
            this.enginePickerState = engineId;
    }

    closeEnginePicker() {
        this.enginePickerState = false;
    }

    openSettingsDialog() {
        this.closeAllDialogs();
        if (!this.blockingDialogOpen)
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
        this.enginePickerState = false;
        this.settingsDialogOpen = false;
    }
}
