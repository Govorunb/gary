import type { Game } from "$lib/api/game.svelte";
import type { Action } from "$lib/api/v1/spec";
import type { EngineId } from "./engines/EngineConfig.svelte";

export type DialogState =
    | { type: "manualSend", action: Action, game: Game }
    | { type: "rawMessage", game: Game }
    | { type: "diagnostics", game: Game }
    | { type: "update" }
    | { type: "enginePicker", engineId: EngineId | null }
    | { type: "settings" };

export type DialogType = DialogState["type"];

export class DialogManager {
    #activeDialog = $state<DialogState | null>(null);
    #prefsLoadErrorOpen = $state(false);

    get activeDialog() {
        return this.#activeDialog;
    }

    get blockingDialogOpen() {
        return this.#prefsLoadErrorOpen;
    }

    get anyDialogOpen() {
        return this.#activeDialog !== null || this.#prefsLoadErrorOpen;
    }

    isOpen(type: DialogType) {
        return this.#activeDialog?.type === type;
    }

    closeDialog(type?: DialogType) {
        if (!type || this.#activeDialog?.type === type) {
            this.#activeDialog = null;
        }
    }

    setPrefsLoadErrorOpen(open: boolean) {
        this.#prefsLoadErrorOpen = open;
        if (open) this.closeDialog();
    }

    openManualSendDialog(action: Action, game: Game) {
        this.openDialog({ type: "manualSend", action, game });
    }

    openRawMessageDialog(game: Game) {
        this.openDialog({ type: "rawMessage", game });
    }

    openDiagnosticsDialog(game: Game) {
        this.openDialog({ type: "diagnostics", game });
    }

    openUpdateDialog() {
        this.openDialog({ type: "update" });
    }

    openEnginePicker() {
        this.openDialog({ type: "enginePicker", engineId: null });
    }

    openEngineConfig(engineId: EngineId) {
        this.openDialog({ type: "enginePicker", engineId });
    }

    closeEnginePicker() {
        this.closeDialog("enginePicker");
    }

    openSettingsDialog() {
        this.openDialog({ type: "settings" });
    }

    toggleSettingsDialog() {
        if (this.isOpen("settings")) {
            this.closeDialog("settings");
        } else {
            this.openSettingsDialog();
        }
    }

    private openDialog(dialog: DialogState) {
        if (!this.blockingDialogOpen) {
            this.#activeDialog = dialog;
        }
    }
}
