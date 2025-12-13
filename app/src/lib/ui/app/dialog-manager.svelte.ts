import type { Action } from "$lib/api/v1/spec";
import type { Game } from "$lib/api/registry.svelte";

export type ManualSendDialogState = null | { action: Action, game: Game };
export type RawMessageDialogState = null | { game: Game };

export class DialogManager {
    manualSendDialog: ManualSendDialogState = $state(null);
    rawMessageDialog: RawMessageDialogState = $state(null);
    enginePickerOpen: boolean = $state(false);

    anyDialogOpen = $derived(!!(this.manualSendDialog || this.rawMessageDialog || this.enginePickerOpen));

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

    closeAllDialogs() {
        this.manualSendDialog = null;
        this.rawMessageDialog = null;
        this.enginePickerOpen = false;
    }
}