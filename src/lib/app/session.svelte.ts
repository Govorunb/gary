import { v4 as uuidv4 } from "uuid";
import { ContextManager } from "./context.svelte";
import { Scheduler } from "./scheduler.svelte";
import type { Engine } from "./engines/index.svelte";
import { Registry } from "$lib/api/registry.svelte";
import type { UserPrefs } from "./prefs.svelte";
import { OpenAIEngine, zOpenAIPrefs } from "./engines/llm/openai.svelte";
import { EVENT_BUS } from "./events/bus";
import { toast } from "svelte-sonner";
import { Randy, ENGINE_ID as RANDY_ID } from "./engines/randy.svelte";
import { OpenRouter, ENGINE_ID as OPENROUTER_ID } from "./engines/llm/openrouter.svelte";
import { UIState } from "$lib/ui/app/ui-state.svelte";
import type { EventDef } from "./events";

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
        EVENT_BUS.emit('app/session/created', { session: this });
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
            EVENT_BUS.emit('app/session/engine/not_found', { id });
            toast.error(`Engine ${id} not found, reverting to Randy`);
            id = RANDY_ID;
        }
        return this.engines[id];
    }

    public deleteEngine(id: string) {
        if (id === RANDY_ID || id === OPENROUTER_ID) {
            EVENT_BUS.emit('app/session/engine/no_delete_system', { id });
            toast.error(`Cannot delete system engine ${id}`);
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
        EVENT_BUS.emit('app/session/disposed', { session: this });
    }

    public initEngine(id?: string): string {
        if (!id) {
            id = uuidv4();
            this.userPrefs.engines[id] = zOpenAIPrefs.decode({ name: "New engine" });
            EVENT_BUS.emit('app/session/engine/created', { id });
            toast.success(`Created engine ${id.substring(0, 8)}`);
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
        EVENT_BUS.emit('app/session/engine/initialized', { id });
        return id;
    }
}

export const EVENTS = [
    {
        key: 'app/session/created',
        dataSchema: {} as { session: { id: string, name: string } },
        description: "Created session",
    },
    {
        key: 'app/session/disposed',
        dataSchema: {} as { session: { id: string, name: string } },
        description: "Disposed session",
    },
    {
        key: 'app/session/engine/not_found',
        dataSchema: {} as { id: string },
        description: "Tried to get engine but it doesn't exist, reverting to Randy",
    },
    {
        key: 'app/session/engine/no_delete_system',
        dataSchema: {} as { id: string },
        description: "Cannot delete system engine",
    },
    {
        key: 'app/session/engine/created',
        dataSchema: {} as { id: string },
        description: "Created new engine",
    },
    {
        key: 'app/session/engine/initialized',
        dataSchema: {} as { id: string },
        description: "Initialized engine",
    },
] as const satisfies EventDef<'app/session'>[];
