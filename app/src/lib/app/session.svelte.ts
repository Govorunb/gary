import { v4 as uuidv4 } from "uuid";
import { DefaultContextManager } from "./context.svelte";
import { Scheduler } from "./scheduler.svelte";
import type { Engine } from "./engines";
import { Registry } from "$lib/api/registry.svelte";
import type { UserPrefs } from "./prefs.svelte";
import { OpenAIEngine, zOpenAIPrefs, type OpenAIPrefs } from "./engines/llm/openai";

/**
 * Represents a user session within the app.
 * 
 * Maybe in the future the app can save/load sessions, or run multiple at once, or something.
 * For now, it's just a "tree root"/"manager manager" kind of thing.
 */
export class Session {
    readonly id: string;
    readonly context: DefaultContextManager;
    readonly registry: Registry;
    readonly scheduler: Scheduler;
    activeEngine: Engine<any> | null = $state(null);
    customEngines: OpenAIEngine[] = $state([]);
    name: string;
    private ondispose: (() => void)[];

    constructor(name: string, private readonly userPrefs: UserPrefs) {
        this.id = uuidv4();
        this.name = $state(name);
        this.ondispose = [];
        this.context = new DefaultContextManager(this);
        this.registry = new Registry(this);
        this.scheduler = new Scheduler(this, this.userPrefs);
        
        const customEngines = Object.keys(this.userPrefs.engines)
            .filter((key) => key !== "randy" && key !== "openRouter");
        for (const engineId of customEngines) {
            this.initCustomEngine(engineId);
        }
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

    public initCustomEngine(id?: string) {
        if (id === 'randy' || id === 'openRouter' ) {
            throw new Error(`Invalid engine ID: ${id}`);
        }
        if (!id) {
            id = uuidv4();
            this.userPrefs.engines[id] = zOpenAIPrefs.decode({
                name: id.substring(0, 8),
            });
        }
        const engine = new OpenAIEngine(this.userPrefs, id);
        this.customEngines.push(engine);
    }
}
