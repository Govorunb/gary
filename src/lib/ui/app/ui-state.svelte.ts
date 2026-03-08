import type { Session } from "$lib/app/session.svelte";
import { clamp, isApril1st } from "$lib/app/utils";
import { DialogManager } from "./dialog-manager.svelte";

export type DashboardSidebarSide = "left" | "right";

export class UIState {
    selectedGameTab: number = $state(0);
    mobileOpenSidebar: DashboardSidebarSide | null = $state(null);
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

    isSidebarCollapsed(side: DashboardSidebarSide) {
        switch (side) {
            case "left":
                return this.session.userPrefs.app.dashboard.sidebars.leftCollapsed;
            case "right":
                return this.session.userPrefs.app.dashboard.sidebars.rightCollapsed;
        }
    }

    setSidebarCollapsed(side: DashboardSidebarSide, collapsed: boolean) {
        switch (side) {
            case "left":
                this.session.userPrefs.app.dashboard.sidebars.leftCollapsed = collapsed;
                break;
            case "right":
                this.session.userPrefs.app.dashboard.sidebars.rightCollapsed = collapsed;
                break;
        }
    }

    toggleSidebar(side: DashboardSidebarSide) {
        this.setSidebarCollapsed(side, !this.isSidebarCollapsed(side));
    }

    isMobileSidebarOpen(side: DashboardSidebarSide) {
        return this.mobileOpenSidebar === side;
    }

    openMobileSidebar(side: DashboardSidebarSide) {
        this.mobileOpenSidebar = side;
    }

    closeMobileSidebar() {
        this.mobileOpenSidebar = null;
    }

    selectGameTab(gameId: string) {
        const i = this.session.registry.games.findIndex((g) => g.conn.id === gameId);
        if (i === -1) return;
        this.selectedGameTab = i;
    }
}
