import { check as tauriCheckUpdate, type Update } from "@tauri-apps/plugin-updater";
import r from "$lib/app/utils/reporting";
import { err, ok, type Result, ResultAsync } from "neverthrow";
import dayjs, { type OpUnitType } from "dayjs";
import type { UserPrefs } from "./prefs.svelte";
import type { UIState } from "$lib/ui/app/ui-state.svelte";
import { isTauri } from "@tauri-apps/api/core";
import { sleep } from "./utils";

const simUpdate: Update = {
    available: true,
    currentVersion: '0.0.0',
    version: '1.0.0',
    body: 'Did stuff.'
} as any as Update;

export class Updater {
    public readonly update: Update | null;
    public hasPendingUpdate: boolean;
    #checkingForUpdates = $state(false);
    #lastCheckResult: Result<Update | null, string> | null = $state(null);

    private get prefs() {
        return this.userPrefs.app.updates;
    }

    public get skipVersion() {
        return this.prefs.skipUpdateVersion;
    }

    public get checkingForUpdates() {
        return this.#checkingForUpdates;
    }

    public get lastCheckResult() {
        return this.#lastCheckResult;
    }

    constructor(private readonly userPrefs: UserPrefs, private readonly uiState: UIState) {
        this.update = $derived(this.#lastCheckResult?.unwrapOr(null) ?? null);
        this.hasPendingUpdate = $derived(!!this.update && this.skipVersion !== this.update.version);
        if (this.shouldAutoCheck()) {
            void this.checkForUpdates(false);
        }
    }

    private shouldAutoCheck(): boolean {
        const checkFreq = this.prefs.autoCheckInterval;

        if (checkFreq === "everyLaunch") return true;
        if (checkFreq === "off") return false;
        // from here, checkFreq is periodic (daily/weekly/monthly)

        const lastCheckedAt = this.prefs.lastCheckedAt;
        if (!lastCheckedAt) return true; // never checked

        const units = {
            'daily': 'd',
            'weekly': 'w',
            'monthly': 'M'
        } as const satisfies Record<typeof checkFreq, OpUnitType>;
        const unit = units[checkFreq];

        // with invalid values, unit defaults to milliseconds (equivalent to "everyLaunch")
        return dayjs().isAfter(dayjs(lastCheckedAt), unit);
    }

    async checkForUpdates(isCheckManual = false): Promise<Result<Update | null, string>> {
        this.#checkingForUpdates = true;

        let updateRes: Result<Update | null, string>;
        r.debug(`Checking for updates (${isCheckManual ? "manual" : "auto"})`);
        if (isTauri()) {
            updateRes = await ResultAsync.fromPromise(tauriCheckUpdate(), (e) => e as string);
        } else {
            // vite dev
            await sleep(500);
            updateRes = [ok(simUpdate), ok(null), err("failed the vibe check")][Math.floor(3 * Math.random())];
        }
        this.#lastCheckResult = updateRes;
        this.#checkingForUpdates = false;

        if (updateRes.isOk()) {
            this.prefs.lastCheckedAt = Date.now();
            if (this.update) {
                const skipped = this.skipVersion === this.update.version;
                if (skipped) {
                    r.info("Update skipped", `Version ${this.update.version} was previously set as skipped`);
                } else if (!isCheckManual) {
                    await this.notifyUpdateAvailable();
                }
            } else {
                r.info("No update available");
            }
        } else {
            r.error("Could not check for updates", {
                details: updateRes.error,
                toast: false,
            });
        }
        return updateRes;
    }

    async notifyUpdateAvailable() {
        if (!this.update) return;
        if (this.skipVersion === this.update.version) return;

        r.success("Update available!", {
            details: `Version ${this.update.version} is available`,
            toast: {
                closeButton: true,
                action: {
                    label: "See more",
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
