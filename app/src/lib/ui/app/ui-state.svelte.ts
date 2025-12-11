import type { Session } from "$lib/app/session.svelte";
import { clamp } from "$lib/app/utils";
import type { Action } from "$lib/api/v1/spec";
import type { Game } from "$lib/api/registry.svelte";

export type ManualSendDialogState = null | { action: Action, game: Game };
export type RawMessageDialogState = null | { game: Game };

export class UIState {
    selectedGameTab: number = $state(0);
    manualSendDialog: ManualSendDialogState = $state(null);
    rawMessageDialog: RawMessageDialogState = $state(null);

    constructor(private readonly session: Session) {
        $effect(() => {
            this.selectedGameTab = clamp(this.selectedGameTab, 0, session.registry.games.length - 1);
        });
    }

    selectGameTab(gameId: string) {
        const i = this.session.registry.games.findIndex((g) => g.conn.id === gameId);
        if (i === -1) return;
        this.selectedGameTab = i;
    }

    openManualSendDialog(action: Action, game: Game) {
        this.manualSendDialog = { action, game };
    }

    closeManualSendDialog() {
        this.manualSendDialog = null;
    }

    openRawMessageDialog(game: Game) {
        this.rawMessageDialog = { game };
    }

    closeRawMessageDialog() {
        this.rawMessageDialog = null;
    }
}
