import { v4 as uuidv4 } from "uuid";
import { DefaultContextManager } from "./context.svelte";

export const SESSION = "session";

/**
 * Represents a user session within the app.
 * 
 * Maybe in the future the app can save/load sessions, or run multiple at once, or something.
 */
export class Session {
    readonly id: string;
    readonly context: DefaultContextManager;
    name: string;
    private ondispose: (() => void)[];

    constructor(name: string) {
        this.id = uuidv4();
        this.name = $state(name);
        this.context = new DefaultContextManager();
        this.ondispose = [];
    }

    onDispose(callback: () => void) {
        this.ondispose.unshift(callback);
    }

    dispose() {
        for (const callback of this.ondispose) {
            callback();
        }
        this.ondispose.length = 0;
    }
}