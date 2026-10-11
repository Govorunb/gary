import { check as tauriCheckUpdate, Update } from "@tauri-apps/plugin-updater";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { clean as semverClean, rcompare as semverRcompare } from "semver";
import { err, ok, type Result, ResultAsync } from "neverthrow";
import dayjs, { type OpUnitType } from "dayjs";
import type { UserPrefs } from "./prefs.svelte";
import type { UIState } from "#lib/ui/app/ui-state.svelte.js";
import { isTauri } from "@tauri-apps/api/core";
import { pickRandom, sleep, safeInvoke, type Await, LogLevel } from "./utils";
import { formatZodError, safeParse } from "./utils/zod";
import type { EventDef, Keys, PresentDefs } from "./events";
import { EVENT_BUS } from "./events/bus";
import { toast } from "svelte-sonner";
import z from "zod";

const simUpdate: Update = {
    available: true,
    currentVersion: '0.0.0',
    version: '1.0.0',
    body: 'Did stuff.'
} as any as Update;

const RELEASES_URL = "https://api.github.com/repos/Govorunb/gary/releases?per_page=10";
const zReleases = z.array(z.object({
    tag_name: z.string(),
    prerelease: z.boolean(),
    assets: z.array(z.object({ name: z.string(), browser_download_url: z.string() })),
}));

/** The newest release with an updater manifest, pre-releases included. */
export function newestRelease(releases: z.infer<typeof zReleases>) {
    return releases
        .flatMap(r => {
            const version = semverClean(r.tag_name);
            const manifest = r.assets.find(a => a.name === "latest.json");
            return version && manifest ? [{ version, manifest: manifest.browser_download_url, prerelease: r.prerelease }] : [];
        })
        .sort((a, b) => semverRcompare(a.version, b.version))[0];
}

/** Updates from the stable channel never set `prerelease`, since it only sees full releases. */
export type AvailableUpdate = Update & { prerelease?: boolean };

function checkPrerelease(): ResultAsync<AvailableUpdate | null, string> {
    return ResultAsync.fromPromise(
        tauriFetch(RELEASES_URL).then(r => r.ok ? r.json() : Promise.reject(`GitHub responded with ${r.status}`)),
        String,
    )
        .andThen(json => safeParse(zReleases, json).mapErr(e => formatZodError(e).join("\n")))
        .andThen(releases => {
            const release = newestRelease(releases);
            return release ? ok(release) : err("No releases to update to");
        })
        .andThen(({ manifest, prerelease }) =>
            safeInvoke<ConstructorParameters<typeof Update>[0] | null>("check_update", { endpoint: manifest })
                .map(metadata => metadata && Object.assign(new Update(metadata), { prerelease })));
}

export class Updater {
    public readonly update: AvailableUpdate | null;
    public hasPendingUpdate: boolean;
    #checkingForUpdates = $state(false);
    #lastCheckResult: Result<AvailableUpdate | null, string> | null = $state(null);

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

    async checkForUpdates(isCheckManual = false): Promise<Result<AvailableUpdate | null, string>> {
        this.#checkingForUpdates = true;

        let updateRes: Result<AvailableUpdate | null, string>;
        EVENT_BUS.emit('app/update/check', { isManual: isCheckManual });
        if (isTauri()) {
            updateRes = await (this.prefs.channel === "prerelease"
                ? checkPrerelease()
                : ResultAsync.fromPromise(tauriCheckUpdate(), (e) => e as string));
        } else {
            // vite dev
            await sleep(500);
            updateRes = pickRandom([ok(simUpdate), ok(null), err("failed the vibe check")]);
        }
        this.#lastCheckResult = updateRes;
        this.#checkingForUpdates = false;

        EVENT_BUS.emit('app/update/check/result', { result: updateRes, isManual: isCheckManual, skipVersion: this.skipVersion });

        if (updateRes.isOk()) {
            this.prefs.lastCheckedAt = Date.now();
            if (this.update) {
                const skipped = this.skipVersion === this.update.version;
                if (skipped) {
                    EVENT_BUS.emit('app/update/skipped', { version: this.update.version });
                } else if (!isCheckManual) {
                    await this.notifyUpdateAvailable();
                }
            } else {
                EVENT_BUS.emit('app/update/none_available');
            }
        } else {
            EVENT_BUS.emit('app/update/check_error', { error: updateRes.error });
        }
        return updateRes;
    }

    async notifyUpdateAvailable() {
        if (!this.update) return;
        if (this.skipVersion === this.update.version) return;

        EVENT_BUS.emit('app/update/notify_available', { version: this.update.version });
        toast.success("Update available!", {
            description: `Version ${this.update.version} is available`,
            action: {
                label: "See more",
                onClick: () => this.promptForUpdate(),
            }
        });
    }

    async promptForUpdate() {
        if (!this.update) return;

        this.uiState.dialogs.openUpdateDialog();
    }
}

export const EVENTS = [
    {
        key: 'app/update/check',
        dataSchema: z.object({
            isManual: z.boolean(),
        }),
        description: "Checking for updates",
        level: LogLevel.Debug,
    },
    {
        key: 'app/update/check/result',
        dataSchema: z.object({
            result: z.custom<Await<ReturnType<Updater['checkForUpdates']>>>(),
            isManual: z.boolean(),
            skipVersion: z.string().nullish(),
        }),
        description: "Finished checking for updates",
        level: LogLevel.Info,
    },
    {
        key: 'app/update/check_error',
        dataSchema: z.object({
            error: z.string(),
        }),
        level: LogLevel.Error,
    },
    {
        key: 'app/update/notify_available',
        dataSchema: z.object({
            version: z.string(),
        }),
        description: "Update available",
        level: LogLevel.Success,
    },
    {
        key: 'app/update/skipped',
        dataSchema: z.object({
            version: z.string(),
        }),
        description: "Skipped update",
        level: LogLevel.Info,
    },
    {
        key: 'app/update/none_available',
        description: "No update available",
        level: LogLevel.Info,
    },
    {
        key: 'app/update/restart_failed',
        dataSchema: z.object({
            error: z.custom<Error>(),
        }),
        level: LogLevel.Error,
    },
] as const satisfies EventDef<'app/update'>[];

export const DISPLAY = {
    "app/update/check_error": ({ error }) => ({
        title: "Update check failed",
        description: error,
    }),
    "app/update/restart_failed": ({ error }) => ({
        title: "Failed to restart after update",
        description: `${error}`,
    }),
} as PresentDefs<Keys<typeof EVENTS>>;
