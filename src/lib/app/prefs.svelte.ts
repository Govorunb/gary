import z, { ZodError } from "zod";
import { zOpenRouterPrefs } from "./engines/llm/openrouter.svelte";
import { zOpenAIPrefs } from "./engines/llm/openai.svelte";
import { zRandyPrefs, ENGINE_ID as RANDY_ID } from "./engines/randy.svelte";
import { toast } from "svelte-sonner";
import { APP_VERSION, formatZodError, jsonParse, safeParse } from "./utils";
import { migrate, moveField, type Migration } from "./utils/migrations";
import { err, ok, type Result } from "neverthrow";
import type { EventDef } from "./events";
import { EVENT_BUS } from "./events/bus";

export const USER_PREFS = "userPrefs";

export class UserPrefs {
    #data: UserPrefsData;

    // TODO: should be a boolean
    loadError: string | null = $state(null);

    constructor(loadRes: Result<UserPrefsData, string>) {
        this.#data = $state(null!);
        // data gets set before effect runs (we don't save defaults over)
        if (loadRes.isErr()) {
            this.loadError = loadRes.error;
            this.setData(zUserPrefs.decode({}));
        } else {
            this.setData(zUserPrefs.decode(loadRes.value));
        }

        // TODO: debounce for file write (if ever)
        // the runed debouncer self-depends so we have to untrack
        // but then this.#data is also untracked (https://svelte.dev/docs/svelte/$effect#Understanding-dependencies)
        $effect(() => void this.save());
    }
    /** A **non-reactive deep copy** of the current data. */
    get data() {
        return structuredClone($state.snapshot(this.#data));
    }
    get app() {
        return this.#data.app;
    }
    get api() {
        return this.#data.api;
    }
    get engines() {
        return this.#data.engines;
    }

    static async loadData(): Promise<Result<UserPrefsData, string>> {
        const dataStr = localStorage.getItem(USER_PREFS) ?? "{}";
        const lsRes = jsonParse(dataStr);
        if (lsRes.isErr()) {
            return err(`JSON failed: ${lsRes.error}`);
        }
        const data = lsRes.value;

        const migrated = migrate(APP_VERSION, data, MIGRATIONS);

        const parsed = zUserPrefs.safeParse(migrated ?? data);
        // most fields have defaults, so this should only fail in extreme cases
        if (!parsed.success) {
            const zodError = parsed.error;
            const errorMessage = `Validation failed:\n${formatZodError(zodError).join("\n")}`;

            EVENT_BUS.emit("app/prefs/load/parse_failed", { error: zodError });

            return err(errorMessage);
        }

        EVENT_BUS.emit("app/prefs/load/success");

        // TODO: dedicated thing for fixups
        if (!Reflect.has(parsed.data.engines, parsed.data.app.selectedEngine)) {
            EVENT_BUS.emit("app/prefs/fixups/selected_engine_not_found", { engineId: parsed.data.app.selectedEngine });

            parsed.data.app.selectedEngine = RANDY_ID;
            toast.warning("Selected engine not found, defaulting to Randy", {
                dismissable: true,
                closeButton: true,
                id: "prefs-selected-engine-not-found",
                position: "top-center",
                action: {
                    label: "OK",
                    onClick: () => {
                        toast.dismiss("prefs-selected-engine-not-found");
                    }
                }
            });
        }
        return ok(parsed.data);
    }

    async save() {
        if (this.loadError) {
            EVENT_BUS.emit('app/prefs/save/cancelled_due_to_load_error');
            return;
        }
        // TODO: validation here (fatal if fails)
        this.write(JSON.stringify(this.#data));
        EVENT_BUS.emit('app/prefs/save/success');
    }

    private async write(contents: string) {
        localStorage.setItem(USER_PREFS, contents);
    }

    public getGamePrefs(game: string) {
        return this.api.games[game] ??= zGamePrefs.decode({});
    }

    public importData(data: unknown) {
        if (typeof data !== "object") return err(`Validation failed: Must be a JSON object`);

        return safeParse(zUserPrefs, migrate(APP_VERSION, data, MIGRATIONS))
            .map(d => this.setData(d))
            .mapErr(e => `Validation failed. Errors:\n\t${formatZodError(e).join("\n\t")}`)
            .andTee(() => this.loadError = null);
    }

    private setData(data: UserPrefsData) {
        this.#data = data;
    }
}

export const zAppPrefs = z.strictObject({
    theme: z.enum(["system", "light", "dark"]).fallback("system"),
    selectedEngine: z.string().fallback(RANDY_ID),
    ctxInputSilent: z.boolean().fallback(false),
    manualSendSchemaCollapsed: z.boolean().fallback(true),
    rawSendSelectedPreset: z.enum(["empty", "action", "actions/reregister_all", "shutdown/graceful", "shutdown/immediate"]).fallback("empty"),
    systemPrompt: z.string().nullish(),
    joyless: z.boolean().fallback(false),
    garyGoldMembershipEndsAfter: z.number().nullish(),
    updates: z.strictObject({
        skipUpdateVersion: z.string().nullish(),
        autoCheckInterval: z.enum([
            // all automatic update checks are done once on launch
            "everyLaunch", "daily", "weekly", "monthly", "off"
        ]).fallback("daily"),
        lastCheckedAt: z.number().nullish(),
    }).prefault({}),
});

export const zGamePrefs = z.strictObject({
    diagnostics: z.strictObject({
        suppressions: z.array(z.string()).prefault([]),
    }).prefault({}),
}).prefault({});

export const zApiPrefs = z.strictObject({
    server: z.strictObject({
        port: z.coerce.number().int().min(1024).max(65535).fallback(8000),
        // TODO: server behavior toggles (e.g. conflict resolution)
    }).prefault({}),
    games: z.record(z.string(), zGamePrefs.optional()).prefault({}),
});

// TODO: $env:MY_ENV_VAR

export const zUserPrefs = z.strictObject({
    version: z.string().prefault(APP_VERSION),
    app: zAppPrefs.prefault({}),
    api: zApiPrefs.prefault({}),
    engines: z.object({
        randy: zRandyPrefs.prefault({}),
        openRouter: zOpenRouterPrefs.prefault({})
    })
    .catchall(zOpenAIPrefs) // all others are OpenAI-compatible
    // first-time defaults
    .prefault(() => ({
        ollama: zOpenAIPrefs.decode({
            name: "Ollama",
            serverUrl: "http://localhost:11434/v1",
            apiKey: "",
        }),
        lmstudio: zOpenAIPrefs.decode({
            name: "LMStudio",
            serverUrl: "http://localhost:1234/v1",
            apiKey: "",
        }),
    })),
});

export type UserPrefsData = z.infer<typeof zUserPrefs>;
export type AppPrefs = z.infer<typeof zAppPrefs>;
export type ApiPrefs = z.infer<typeof zApiPrefs>;

const MIGRATIONS: Migration[] = [
    {
        version: "1.0.0-beta.2",
        description: "created .api and moved .server into it (.server.port -> .api.server.port)",
        migrate(data) {
            if (!data) return;
            moveField(data, "server", "api.server");
        }
    },
];

export const EVENTS = [
    {
        key: 'app/prefs/load/parse_failed',
        dataSchema: z.object({
            error: z.instanceof(ZodError).transform(e => e as ZodError<UserPrefsData>),
        }),
        description: "User prefs failed validation during load",
    },
    {
        key: 'app/prefs/load/success',
        description: "User prefs loaded successfully",
    },
    {
        key: 'app/prefs/fixups/selected_engine_not_found',
        dataSchema: z.object({
            engineId: z.string(),
        }),
        description: "Saved 'selected engine ID' not found, defaulting to Randy",
    },
    {
        key: 'app/prefs/save/cancelled_due_to_load_error',
        description: "Backed out of saving due to current load error",
    },
    {
        key: 'app/prefs/save/success',
        description: "User prefs saved successfully",
    },
    {
        key: 'app/prefs/import/failed',
        description: "User prefs import failed",
    },
] as const satisfies EventDef<'app/prefs'>[];
