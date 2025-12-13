import type { Session } from "$lib/app/session.svelte";
import { clamp } from "$lib/app/utils";
import { DialogManager } from "./dialog-manager.svelte";

export class UIState {
    selectedGameTab: number = $state(0);
    readonly dialogs = new DialogManager();

    anyDialogOpen = $derived(this.dialogs.anyDialogOpen);

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
}
