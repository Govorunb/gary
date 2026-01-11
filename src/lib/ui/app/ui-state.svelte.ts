import type { Session } from "$lib/app/session.svelte";
import { clamp, isApril1st } from "$lib/app/utils";
import { DialogManager } from "./dialog-manager.svelte";

export class UIState {
    selectedGameTab: number = $state(0);
    readonly dialogs = new DialogManager();
    aprilFools: boolean;

    get anyDialogOpen() {
        return this.dialogs.anyDialogOpen;
    }

    constructor(private readonly session: Session) {
        $effect(() => {
            this.selectedGameTab = clamp(this.selectedGameTab, 0, session.registry.games.length - 1);
        });
        $effect(() => {
            this.dialogs.prefsLoadErrorOpen = !!session.userPrefs.loadError;
        });
        this.aprilFools = $derived.by(() => isApril1st()
            && !this.session.userPrefs.app.joyless
            && this.session.userPrefs.app.garyGoldMembershipEndsAfter !== new Date().getFullYear()
        );
    }

    devToggleAprilFools() {
        this.aprilFools = !this.aprilFools;
    }

    selectGameTab(gameId: string) {
        const i = this.session.registry.games.findIndex((g) => g.conn.id === gameId);
        if (i === -1) return;
        this.selectedGameTab = i;
    }
}
