import { v4 as uuidv4 } from "uuid";
import { DefaultContextManager } from "./context.svelte";
import { Scheduler } from "./scheduler.svelte";
import type { Engine } from "./engines/index.svelte";
import { Registry } from "$lib/api/registry.svelte";
import type { UserPrefs } from "./prefs.svelte";
import { OpenAIEngine, zOpenAIPrefs } from "./engines/llm/openai.svelte";
import * as log from "@tauri-apps/plugin-log";
import { getOpenRouter, getRandy } from "./utils/di";
import { ENGINE_ID as RANDY_ID } from "./engines/randy.svelte";
import { ENGINE_ID as OPENROUTER_ID } from "./engines/llm/openrouter.svelte";

/**
 * Represents a user session within the app.
 * 
 * Maybe in the future the app can save/load sessions, or run multiple at once, or something.
 * For now, it's just a "DI root"/"manager manager" kind of thing.
 */
export class Session {
    readonly id: string;
    readonly context: DefaultContextManager;
    readonly registry: Registry;
    readonly scheduler: Scheduler;
    
    customEngines: Record<string, Engine<any>> = $state({});
    activeEngine: Engine<any>;

    name: string;
    private ondispose: (() => void)[];

    constructor(name: string, public readonly userPrefs: UserPrefs) {
        this.id = uuidv4();
        this.name = $state(name);
        this.ondispose = [];
        this.context = new DefaultContextManager(this);
        this.registry = new Registry(this);
        this.scheduler = new Scheduler(this);
        log.info(`Created session ${name} (${this.id})`);
        for (const id of Object.keys(this.userPrefs.engines)) {
            if (id === RANDY_ID || id === OPENROUTER_ID) {
                continue;
            }
            this.initCustomEngine(id);
        }
        this.activeEngine = $derived.by(() => this.getEngine(this.userPrefs.app.selectedEngine));
    }

    private getEngine(id: string): Engine<any> {
        if (id === RANDY_ID) {
            return getRandy();
        } else if (id === OPENROUTER_ID) {
            return getOpenRouter();
        }
        if (!this.customEngines[id]) {
            log.error(`Tried to get engine ${id} but it doesn't exist, reverting to Randy`);
            return getRandy();
        }
        return this.customEngines[id];
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
        this.customEngines = {};
        log.info(`Disposed session ${this.name} (${this.id})`);
    }

    public initCustomEngine(id?: string): string {
        if (!id) {
            id = uuidv4();
            this.userPrefs.engines[id] = zOpenAIPrefs.decode({
                name: id.substring(0, 8),
            });
        }
        this.customEngines[id] = new OpenAIEngine(this.userPrefs, id);
        // active engine will be set by the picker
        log.info(`Initialized custom engine ${id}`);
        return id;
    }
}
