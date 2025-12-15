import { check as tauriCheckUpdate, type Update } from "@tauri-apps/plugin-updater";
import r, { LogLevel } from "$lib/app/utils/reporting";
import { ok, type Result, ResultAsync } from "neverthrow";
import dayjs from "dayjs";
import type { UserPrefs } from "./prefs.svelte";
import type { UIState } from "$lib/ui/app/ui-state.svelte";
import { isTauri } from "@tauri-apps/api/core";

const simUpdate: Update = {
    available: true,
    currentVersion: '0.0.0',
    version: '1.0.0',
    body: 'Did stuff.'
} as any as Update;

export class Updater {
    public update?: Update | null = $state();
    public skipVersion?: string | null;
    public hasPendingUpdate: boolean;
    public checkingForUpdates = $state(false);
    private readonly prefs;
    
    constructor(private readonly userPrefs: UserPrefs, private readonly uiState: UIState) {
        this.prefs = $derived(this.userPrefs.app.updates);
        this.skipVersion = $derived(this.prefs.skipUpdateVersion);
        this.hasPendingUpdate = $derived(!!this.update && this.skipVersion !== this.update.version);
        if (this.shouldAutoCheck()) {
            void this.checkForUpdates(false);
        }
    }

    private shouldAutoCheck(): boolean {
        const checkFreq = this.prefs.autoCheckInterval;
        
        if (checkFreq === "everyLaunch") return true;
        if (checkFreq === "off") return false;
        // from here, autocheck interval is periodic (daily/weekly/monthly)
        
        const lastCheckedAt = this.prefs.lastCheckedAt;
        if (!lastCheckedAt) return true; // never checked
        
        const now = dayjs();
        const lastChecked = dayjs(lastCheckedAt);
        
        switch (checkFreq) {
            case "daily":
                return now.diff(lastChecked, 'day') >= 1;
            case "weekly":
                return now.diff(lastChecked, 'day') >= 7;
            case "monthly":
                return now.diff(lastChecked, 'month') >= 1;
            default:
                r.error(`Unknown value for prefs.app.updates.autoCheckInterval: ${checkFreq}`);
                return false;
        }
    }

    async checkForUpdates(isCheckManual = false) {
        this.prefs.lastCheckedAt = Date.now();
        this.checkingForUpdates = true;
        let updateRes: Result<Update | null, string>;
        if (isTauri()) {
            updateRes = await ResultAsync.fromPromise(tauriCheckUpdate(), (e) => e as string);
        } else {
            updateRes = ok(simUpdate);
        }
        this.checkingForUpdates = false;
        if (updateRes.isErr()) {
            r.error("Could not check for updates", {
                details: `${updateRes.error}`,
                target: "updater",
                toast: isCheckManual,
            });
            return;
        }
        const update = updateRes.value;
        this.update = update;
        if (!update) {
            r.info("No update available", { toast: isCheckManual });
            return;
        }
        const skipped = this.skipVersion === update.version;
        if (skipped && !isCheckManual) return;
        
        r.success("Update available!", {
            details: `Version ${update.version} is available${skipped ? " (you have skipped this version)" : ""}`,
            toast: {
                level: skipped ? LogLevel.Warning : undefined,
                closeButton: true,
                action: {
                    label: "Update",
                    onClick: () => this.promptForUpdate(),
                }
            }
        });
    }

    async promptForUpdate() {
        if (!this.update) return;

        this.uiState.dialogs.openUpdateDialog();
    }
}
