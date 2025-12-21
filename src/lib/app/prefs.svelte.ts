import z from "zod";
import r from "$lib/app/utils/reporting";
import { zOpenRouterPrefs } from "./engines/llm/openrouter.svelte";
import { zOpenAIPrefs } from "./engines/llm/openai.svelte";
import { zRandyPrefs, ENGINE_ID as RANDY_ID } from "./engines/randy.svelte";
import { toast } from "svelte-sonner";
import { APP_VERSION } from "./utils";

export const USER_PREFS = "userPrefs";

// TODO: use a tauri store instead (json in appdata for free, auto saves too)
// would still need a validation/coercion wrapper unfortunately
export class UserPrefs {
    #data: UserPrefsData;

    constructor(data: UserPrefsData) {
        this.#data = $state(zUserPrefs.parse(data));
        
        // TODO: debounce for file write (if ever)
        // the runed debouncer self-depends so we have to untrack
        // but then this.#data is also untracked (https://svelte.dev/docs/svelte/$effect#Understanding-dependencies)
        $effect(() => void this.save());
    }
    get app() {
        return this.#data.app;
    }
    get server() {
        return this.#data.server;
    }
    get engines() {
        return this.#data.engines;
    }

    // TODO: file storage down the road (to make it user editable)
    // or just use [tauri-store](https://github.com/ferreira-tb/tauri-store/)
    static async loadData(): Promise<UserPrefsData> {
        const dataStr = localStorage.getItem(USER_PREFS);
        const data = dataStr === null ? {} : JSON.parse(dataStr);
        const parsed = zUserPrefs.safeParse(data);
        // most fields have defaults, so this should only fail in extreme cases
        if (!parsed.success) {
            const zodError = parsed.error;
            // ideally should be a modal (open json in system editor, try reload, use defaults)
            // mayhaps we should have a loading/splash screen before dashboard init

            r.error("Failed to parse user prefs. They will be replaced with defaults", {
                toast: {
                    description: `Error(s): ${zodError.message}`,
                    dismissable: true,
                    closeButton: true,
                    id: "prefs-load-error",
                    position: "top-center",
                    action: {
                        label: "OK",
                        onClick: () => {
                            toast.dismiss("prefs-load-error");
                        }
                    }
                },
                ctx: {
                    issues: zodError.issues,
                    data,
                }
            });
            return zUserPrefs.decode({});
        }
        r.debug("loaded prefs");
        // TODO: dedicated thing for fixups/migrations
        if (!Reflect.has(parsed.data.engines, parsed.data.app.selectedEngine)) {
            parsed.data.app.selectedEngine = RANDY_ID;
            r.warn("Selected engine not found, defaulting to Randy", {
                toast: {
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
                }
            });
        }
        return parsed.data;
    }

    async save() {
        // TODO: validation here (fatal if fails)
        this.write(JSON.stringify(this.#data));
        r.debug("saved prefs");
    }

    private async write(contents: string) {
        localStorage.setItem(USER_PREFS, contents);
    }
}

export const zAppPrefs = z.strictObject({
    theme: z.enum(["system", "light", "dark"]).fallback("system"),
    selectedEngine: z.string().fallback(RANDY_ID),
    ctxInputSilent: z.boolean().fallback(false),
    manualSendSchemaCollapsed: z.boolean().fallback(true),
    rawSendSelectedPreset: z.enum(["empty", "action", "actions/reregister_all", "shutdown/graceful", "shutdown/immediate"]).fallback("empty"),
    systemPrompt: z.string().nullish(),
    updates: z.strictObject({
        skipUpdateVersion: z.string().nullish(),
        autoCheckInterval: z.enum([
            // all automatic update checks are done once on launch
            "everyLaunch", "daily", "weekly", "monthly", "off"
        ]).fallback("daily"),
        lastCheckedAt: z.number().nullish(),
    }).prefault({}),
});

export const zServerPrefs = z.strictObject({
    port: z.coerce.number().int().min(1024).max(65535).fallback(8000),
    // TODO: server behavior toggles (e.g. conflict resolution)
});

// TODO: env syntax
// $env:MY_ENV_VAR
// {env:MY_ENV_VAR}

export const zUserPrefs = z.strictObject({
    version: z.string().prefault(APP_VERSION),
    app: zAppPrefs.prefault({}),
    server: zServerPrefs.prefault({}),
    engines: z.object({
        randy: zRandyPrefs.prefault({}),
        openRouter: zOpenRouterPrefs.prefault({}) // ts pmtfo
    })
    .catchall(zOpenAIPrefs) // all others are OpenAI-compatible
    // first-time defaults
    .prefault(() => ({
        ollama: zOpenAIPrefs.decode({
            name: "Ollama (localhost)",
            serverUrl: "http://localhost:11434/v1",
            apiKey: "",
        }),
        lmstudio: zOpenAIPrefs.decode({
            name: "LMStudio (localhost)",
            serverUrl: "http://localhost:1234/v1",
            apiKey: "",
        }),
    })),
});

export type UserPrefsData = z.infer<typeof zUserPrefs>;
export type AppPrefs = z.infer<typeof zAppPrefs>;
