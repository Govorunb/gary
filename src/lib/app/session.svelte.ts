import { v4 as uuidv4 } from "uuid";
import { ContextManager } from "./context.svelte";
import { Scheduler } from "./scheduler.svelte";
import type { Engine } from "./engines/index.svelte";
import { Registry } from "$lib/api/registry.svelte";
import type { UserPrefs } from "./prefs.svelte";
import { OpenAIEngine, zOpenAIPrefs } from "./engines/llm/openai.svelte";
import r from "$lib/app/utils/reporting";
import { Randy, ENGINE_ID as RANDY_ID } from "./engines/randy.svelte";
import { OpenRouter, ENGINE_ID as OPENROUTER_ID } from "./engines/llm/openrouter.svelte";
import { UIState } from "$lib/ui/app/ui-state.svelte";

/**
 * Represents a user session within the app.
 *
 * Maybe in the future the app can save/load sessions, or run multiple at once, or something.
 * For now, it's just a "DI root"/"manager manager" kind of thing.
 */
export class Session {
    readonly id: string;
    readonly context: ContextManager;
    readonly registry: Registry;
    readonly scheduler: Scheduler;
    readonly uiState: UIState;

    engines: Record<string, Engine<unknown>> = $state({});
    activeEngine: Engine<unknown>;

    name: string;
    private ondispose: (() => void)[];

    constructor(name: string, public readonly userPrefs: UserPrefs) {
        this.id = uuidv4();
        this.name = $state(name);
        this.ondispose = [];
        this.context = new ContextManager();
        this.registry = new Registry(this);
        this.scheduler = new Scheduler(this);
        this.uiState = new UIState(this);
        r.debug(`Created session ${name} (${this.id})`);
        for (const id of Object.keys(this.userPrefs.engines)) {
            this.initEngine(id);
        }
        this.activeEngine = $derived.by(() => this.getEngine(this.userPrefs.app.selectedEngine));
        // FIXME: why tf is this here
        let topSeenMsg = $state(0);
        $effect(() => {
            const msgCount = this.context.actorView.length;
            for (let i = topSeenMsg; i < msgCount; i++) {
                const msg = this.context.actorView[i];
                if (!msg.silent && msg.source.type !== "actor") {
                    this.scheduler.actPending = true;
                    break;
                }
            }
            topSeenMsg = msgCount;
        })
    }

    private getEngine(id: string): Engine<unknown> {
        if (!this.engines[id]) {
            r.error(`Tried to get engine ${id} but it doesn't exist, reverting to Randy`);
            id = RANDY_ID;
        }
        return this.engines[id];
    }

    public deleteEngine(id: string) {
        if (id === RANDY_ID || id === OPENROUTER_ID) {
            r.error(`Cannot delete system engine ${id}`);
            return;
        }
        if (this.activeEngine.id === id) {
            this.activeEngine = this.engines[RANDY_ID];
        }
        delete this.engines[id];
        delete this.userPrefs.engines[id];
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
        this.engines = {};
        r.info(`Disposed session ${this.name} (${this.id})`);
    }

    public initEngine(id?: string): string {
        if (!id) {
            id = uuidv4();
            this.userPrefs.engines[id] = zOpenAIPrefs.decode({
                name: "New engine",
            });
            r.success(`Created engine ${id.substring(0, 8)}`);
        }
        switch (id) {
            case RANDY_ID:
                this.engines[id] = new Randy(this.userPrefs);
                break;
            case OPENROUTER_ID:
                this.engines[id] = new OpenRouter(this.userPrefs);
                break;
            default:
                this.engines[id] = new OpenAIEngine(this.userPrefs, id);
                break;
        }
        r.debug(`Initialized engine ${id}`);
        return id;
    }
}
