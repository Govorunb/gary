import { Update } from "@tauri-apps/plugin-updater";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { clean as semverClean, gt as semverGt, rcompare as semverRcompare } from "semver";
import { err, ok, type Result, ResultAsync } from "neverthrow";
import dayjs, { type OpUnitType } from "dayjs";
import type { AppPrefs, UserPrefs } from "./prefs.svelte";
import type { UIState } from "#lib/ui/app/ui-state.svelte.js";
import { isTauri } from "@tauri-apps/api/core";
import { pickRandom, sleep, safeInvoke, type Await, LogLevel } from "./utils";
import { formatZodError, safeParse } from "./utils/zod";
import type { EventDef, Keys, PresentDefs } from "./events";
import { EVENT_BUS } from "./events/bus";
import { toast } from "svelte-sonner";
import z from "zod";

const simUpdate = {
    available: true,
    currentVersion: '0.0.0',
    version: '1.0.0',
    prerelease: false,
    releases: [{ version: '1.0.0', prerelease: false, notesHtml: '<h3>Changes</h3><ul><li>Did stuff.</li></ul>' }],
} as any as AvailableUpdate;

const RELEASES_URL = "https://api.github.com/repos/Govorunb/gary/releases?per_page=100";
const zReleases = z.array(z.object({
    tag_name: z.string(),
    prerelease: z.boolean(),
    body_html: z.string().nullish(),
    assets: z.array(z.object({ name: z.string(), browser_download_url: z.string() })),
}));

type UpdateChannel = AppPrefs["updates"]["channel"];

export type Release = { version: string; prerelease: boolean; notesHtml: string; manifest?: string };

/** The channel's releases newest first, starting from the newest one with an updater manifest (the update target). Empty if there is none. */
export function updateCandidates(releases: z.infer<typeof zReleases>, channel: UpdateChannel): Release[] {
    const sorted = releases
        .flatMap(r => {
            const version = semverClean(r.tag_name);
            if (!version || (channel === "stable" && r.prerelease)) return [];
            const manifest = r.assets.find(a => a.name === "latest.json")?.browser_download_url;
            return [{ version, prerelease: r.prerelease, notesHtml: r.body_html ?? "", manifest }];
        })
        .sort((a, b) => semverRcompare(a.version, b.version));
    const target = sorted.findIndex(r => r.manifest);
    return target < 0 ? [] : sorted.slice(target);
}

export type AvailableUpdate = Update & {
    prerelease: boolean;
    /** Every release since the current version, newest first. */
    releases: Release[];
};

function checkForUpdate(channel: UpdateChannel): ResultAsync<AvailableUpdate | null, string> {
    return ResultAsync.fromPromise(
        // GitHub renders and sanitizes the notes' Markdown into `body_html`
        tauriFetch(RELEASES_URL, { headers: { Accept: "application/vnd.github.html+json" } })
            .then(r => r.ok ? r.json() : Promise.reject(`GitHub responded with ${r.status}`)),
        String,
    )
        .andThen(json => safeParse(zReleases, json).mapErr(e => formatZodError(e).join("\n")))
        .andThen(releases => {
            const candidates = updateCandidates(releases, channel);
            return candidates.length ? ok(candidates) : err("No releases to update to");
        })
        .andThen(candidates =>
            safeInvoke<ConstructorParameters<typeof Update>[0] | null>("check_update", { endpoint: candidates[0].manifest })
                .map(metadata => metadata && Object.assign(new Update(metadata), {
                    prerelease: candidates[0].prerelease,
                    releases: candidates.filter(r => semverGt(r.version, metadata.currentVersion)),
                })));
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
            updateRes = await checkForUpdate(this.prefs.channel);
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
