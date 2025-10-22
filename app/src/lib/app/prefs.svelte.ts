import z from "zod";
import * as log from "@tauri-apps/plugin-log";
import { toast } from "svelte-sonner";
// import * as store from "@tauri-apps/plugin-store";

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
    }

    get theme() {
        return this.#data.theme;
    }
    set theme(theme: "system" | "light" | "dark") {
        this.#data.theme = zUserPrefs.shape.theme.parse(theme);
    }

    get serverPort() {
        return this.#data.serverPort;
    }
    set serverPort(port: number) {
        this.#data.serverPort = zUserPrefs.shape.serverPort.parse(port);
    }

    // TODO: file storage down the road (to make it user editable)
    static async loadData(): Promise<UserPrefsData> {
        const dataStr = localStorage.getItem(USER_PREFS);
        const data = dataStr === null ? {} : JSON.parse(dataStr);
        const parsed = zUserPrefs.safeParse(data);
        // most fields have defaults, so this should only fail in extreme cases
        if (!parsed.success) {
            const zodError = z.treeifyError(parsed.error);
            // ideally should be a modal (open json for editing, try reload, use defaults)
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
            return zUserPrefs.parse({});
        }
        log.debug("loaded prefs");
        return parsed.data;
    }

    async save() {
        localStorage.setItem(USER_PREFS, JSON.stringify(this.#data));
        log.debug("saved prefs");
    }
}

export const zOpenRouterPrefs = z.strictObject({
    apiKey: z.string().nullish(),
});

export const zUserPrefs = z.strictObject({
    theme: z.enum(["system", "light", "dark"]).default("system"),
    serverPort: z.int().min(1024).max(65535).default(8000),
    openRouter: zOpenRouterPrefs.default(zOpenRouterPrefs.parse({})),
});

export type UserPrefsData = z.infer<typeof zUserPrefs>;
