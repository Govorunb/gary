import z from "zod";
import * as log from "@tauri-apps/plugin-log";
import { toast } from "svelte-sonner";
import { zOpenRouterPrefs, type OpenRouterPrefs } from "./engines/llm/openrouter";
import { zOpenAIPrefs, type OpenAIPrefs } from "./engines/llm/openai";
import { zRandyPrefs, type RandyPrefs } from "./engines/randy";

export const USER_PREFS = "userPrefs";

// TODO: use a tauri store instead (json in appdata for free, auto saves too)
// would still need a validation/coercion wrapper unfortunately
export class UserPrefs {
    #data: UserPrefsData;

    constructor(data: UserPrefsData) {
        $effect(() => {
            void this.#data;
            this.save();
        })
        this.#data = $state(zUserPrefs.parse(data));
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
            const zodError = z.treeifyError(parsed.error);
            // ideally should be a modal (open json in system editor, try reload, use defaults)
            // mayhaps we should have a loading/splash screen before dashboard init
            const zodErrors = zodError.errors.join("\n\t-");
            log.error("failed to parse user prefs\n\tzod errors: \n\t-" + zodErrors);
            toast.error("Failed to parse user prefs", {
                description: `Replaced prefs with defaults\n\tErrors:\n\t- ${zodErrors}`,
                dismissable: true,
                closeButton: true,
                id: "prefs-load-error",
                action: {
                    label: "OK",
                    onClick: () => {
                        toast.dismiss("prefs-load-error");
                    }
                }
            });
            return zUserPrefs.decode({});
        }
        log.debug("loaded prefs");
        return parsed.data;
    }

    async save() {
        localStorage.setItem(USER_PREFS, JSON.stringify(this.#data));
        log.debug("saved prefs");
    }
}

export const zAppPrefs = z.strictObject({
    theme: z.enum(["system", "light", "dark"]).default("system"),
    selectedEngine: z.string().default("randy"),
});

export const zServerPrefs = z.strictObject({
    port: z.coerce.number().int().min(1024).max(65535).default(8000),
    // TODO: server behavior toggles (e.g. conflict resolution)
});

export const zUserPrefs = z.strictObject({
    app: zAppPrefs.prefault({}),
    server: zServerPrefs.prefault({}),
    engines: z.object({
        openRouter: zOpenRouterPrefs.prefault({}),
        randy: zRandyPrefs.prefault({}),
    }).catchall(zOpenAIPrefs).prefault({}),
});

export type UserPrefsData = z.infer<typeof zUserPrefs>;
export type AppPrefs = z.infer<typeof zAppPrefs>;
