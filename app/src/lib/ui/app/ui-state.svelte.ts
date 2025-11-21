import type { Session } from "$lib/app/session.svelte";
import { clamp } from "$lib/app/utils";

export class UIState {
    activeGameTab: number = $state(0);

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
}
