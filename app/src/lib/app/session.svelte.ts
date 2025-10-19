import { v4 as uuidv4 } from "uuid";
import { DefaultContextManager } from "./context.svelte";
import { Scheduler } from "./scheduler.svelte";
import type { Engine } from "./engines";
import { Registry } from "$lib/api/registry.svelte";

/**
 * Represents a user session within the app.
 * 
 * Maybe in the future the app can save/load sessions, or run multiple at once, or something.
 */
export class Session {
    readonly id: string;
    readonly context: DefaultContextManager;
    readonly registry: Registry;
    readonly scheduler: Scheduler;
    activeEngine: Engine<any> | null = $state(null);
    name: string;
    private ondispose: (() => void)[];

    constructor(name: string) {
        this.id = uuidv4();
        this.name = $state(name);
        this.ondispose = [];
        this.context = new DefaultContextManager(this);
        this.registry = new Registry(this);
        this.scheduler = new Scheduler(this);
    }

    onDispose(callback: () => void): () => void {
        this.ondispose.push(callback);
        return () => {
            const i = this.ondispose.indexOf(callback);
            if (i === -1) {
                return;
            }
            this.ondispose.splice(i, 1);
        };
    }

    dispose() {
        for (const callback of this.ondispose.reverse()) {
            callback();
        }
        this.ondispose.length = 0;
    }
}