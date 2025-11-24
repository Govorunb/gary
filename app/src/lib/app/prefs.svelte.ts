import z from "zod";
import r from "$lib/app/utils/reporting";
import { zOpenRouterPrefs } from "./engines/llm/openrouter.svelte";
import { zOpenAIPrefs } from "./engines/llm/openai.svelte";
import { zRandyPrefs, ENGINE_ID as RANDY_ID } from "./engines/randy.svelte";
import { ENGINE_ID as OPENROUTER_ID } from "./engines/llm/openrouter.svelte";
import { toast } from "svelte-sonner";

export const USER_PREFS = "userPrefs";

// TODO: use a tauri store instead (json in appdata for free, auto saves too)
// would still need a validation/coercion wrapper unfortunately
export class UserPrefs {
    #data: UserPrefsData;

    constructor(data: UserPrefsData) {
        this.#data = $state(zUserPrefs.parse(data));
        $effect(() => {
            // normally $effect only tracks what's referenced inside the function
            // (which is the objects themselves and not their properties)
            // this somehow tracks everything though, fancy that
            this.save();
        })
        // TODO: proxy w/ setters that parse through zod
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
        r.debug(`loaded prefs: ${JSON.stringify(parsed.data)}`);
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
        localStorage.setItem(USER_PREFS, JSON.stringify(this.#data));
        r.debug("saved prefs");
    }
}

export const zAppPrefs = z.strictObject({
    theme: z.enum(["system", "light", "dark"]).default("system"),
    selectedEngine: z.string().default(RANDY_ID),
    ctxInputSilent: z.boolean().default(false),
});

export const zServerPrefs = z.strictObject({
    port: z.coerce.number().int().min(1024).max(65535).default(8000),
    // TODO: server behavior toggles (e.g. conflict resolution)
});

// TODO: env syntax
// $env:MY_ENV_VAR
// {env:MY_ENV_VAR}

export const zUserPrefs = z.strictObject({
    app: zAppPrefs.prefault({}),
    server: zServerPrefs.prefault({}),
    engines: z.object({
        randy: zRandyPrefs.prefault({}),
        openRouter: zOpenRouterPrefs.prefault({})
    })
    // all others are OpenAI-compatible
    .catchall(zOpenAIPrefs)
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

export const KNOWN_ENGINE_IDS = [RANDY_ID, OPENROUTER_ID, 'ollama', 'lmstudio'];
