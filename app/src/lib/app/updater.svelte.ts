import { check as tauriCheckUpdate, type Update } from "@tauri-apps/plugin-updater";
import { message as tauriDialog } from "@tauri-apps/plugin-dialog";
import { relaunch as tauriRelaunchProcess } from "@tauri-apps/plugin-process";
import r, { LogLevel } from "$lib/app/utils/reporting";
import { ResultAsync } from "neverthrow";
import dayjs from "dayjs";
import type { UserPrefs } from "./prefs.svelte";

export class Updater {
    public update?: Update | null = $state();
    public skipVersion?: string | null;
    public hasPendingUpdate: boolean;
    public checkingForUpdates = $state(false);
    private readonly prefs;
    
    constructor(private readonly userPrefs: UserPrefs) {
        this.prefs = $derived(userPrefs.app.updates);
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
        this.prefs.lastCheckedAt = dayjs().toISOString();
        this.checkingForUpdates = true;
        const updateRes = await ResultAsync.fromPromise(tauriCheckUpdate(), (e) => e as string);
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
            r.info("No update available");
            if (isCheckManual) {
                await tauriDialog("You are using the latest version.", "No update available");
            }
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
        const update = this.update;
        if (!update) return;

        // TODO: ditch native dialog, we can do better
        // need a 4th "Release Notes" button (update.body is empty by default)
        const answer = await tauriDialog(
            `Update from ${update.currentVersion} to ${update.version}?`,
            {
                title: "Update Available",
                kind: "info",
                buttons: { yes: "Update", no: "Skip this version", cancel: "Cancel" },
            },
        );
        switch (answer) {
            case 'Yes':
                this.userPrefs.app.updates.skipUpdateVersion = undefined;
                await update.downloadAndInstall();
                await tauriRelaunchProcess();
                return;
            case 'No':
                this.userPrefs.app.updates.skipUpdateVersion = update.version;
                this.update = null;
                return;
            case 'Cancel': return;
            default:
                await tauriDialog(
                    "Consider wrapping your computer in 15cm thick lead foil (or moving out from Radiationopolis)",
                    "Cosmic bit flip detected"
                );
        }
    }
}
