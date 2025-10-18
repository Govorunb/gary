import z from "zod";
import * as log from "@tauri-apps/plugin-log";
// import * as store from "@tauri-apps/plugin-store";

export const USER_PREFS = "userPrefs";

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
        if (!parsed.success) {
            const zodError = z.treeifyError(parsed.error);
            // TODO: throw/surface error in app
            log.error("failed to parse user prefs\n\tzod errors: \n\t-" + zodError.errors.join("\n\t-"));
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

export const zUserPrefs = z.strictObject({
    theme: z.enum(["system", "light", "dark"]).default("system"),
    serverPort: z.int().min(1024).max(65535).default(8000),
});

export type UserPrefsData = z.infer<typeof zUserPrefs>;
