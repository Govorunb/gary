import type { Session } from "$lib/app/session.svelte";
import { clamp } from "$lib/app/utils";
import type { Action } from "$lib/api/v1/spec";
import type { Game } from "$lib/api/registry.svelte";

export type ManualSendDialogState = null | { action: Action, game: Game };

export class UIState {
    activeGameTab: number = $state(0);
    manualSendDialog: ManualSendDialogState = $state(null);

    constructor(private readonly session: Session) {
        const games = $derived(session.registry.games);
        $effect(() => {
            this.activeGameTab = clamp(this.activeGameTab, 0, games.length);
        });
    }

    selectGameTab(gameId: string) {
        let i = this.session.registry.games.findIndex((g) => g.conn.id === gameId);
        if (i === -1) return;
        this.activeGameTab = i;
    }

    openManualSendDialog(action: Action, game: Game) {
        this.manualSendDialog = { action, game };
    }

    closeManualSendDialog() {
        this.manualSendDialog = null;
    }
}
