import { createEngine } from "./engines/create";
import { v4 as uuidv4 } from "uuid";
import { CONTEXT_KEYS, ContextManager } from "./context.svelte";
import { Scheduler } from "./scheduler.svelte";
import type { Engine } from "./engines/index.svelte";
import { REGISTRY_KEYS, Registry } from "#lib/api/registry.svelte.js";
import { GAME_KEYS } from "#lib/api/game.svelte.js";
import type { UserPrefs } from "./prefs.svelte";
import { zOpenAIPrefs } from "./engines/llm/openai.svelte";
import { EVENT_BUS, EventBus } from "./events/bus";
import { ENGINE_ID as RANDY_ID } from "./engines/randy.svelte";
import { ENGINE_ID as OPENROUTER_ID } from "./engines/llm/openrouter.svelte";
import { UIState } from "#lib/ui/app/ui-state.svelte.js";
import type { DialogManager } from "#lib/ui/app/dialog-manager.svelte.js";
import type { EventDef, EventInstance, EventKey, Keys, PresentDefs } from "./events";
import { LogLevel, withEffectRoot } from "./utils";
import { EventLogStore } from "./events/log.svelte";
import type { SessionFile } from "./session-file";
import { err, ok, type Result } from "neverthrow";
import z from "zod";
import type { Command } from "./commands";

/** Events the session and its projections are built from, so a fork needs only these. They stay in the log for the session's lifetime. */
export const SESSION_KEYS = ["app/session/created", ...CONTEXT_KEYS, ...REGISTRY_KEYS, ...GAME_KEYS] as const;

/** A session's events. The first is always its creation, which names the session. */
export type SessionEvents = [EventInstance<"app/session/created">, ...EventInstance<EventKey>[]];

/** Events to rebuild a session from, and optionally the bus it should use afterwards. */
export type SessionHistory = { events: SessionEvents; bus?: EventBus };

/**
 * A user session: its event log, and everything derived from it.
 * Context, games and their diagnostics are projections of the log, so replaying a log rebuilds them.
 *
 * Anything the user can do to it is a command (see `./commands`), run through `run`,
 * so the UI and external transports (MCP) share one path.
 */
export class Session {
    readonly id: string;
    /** Games connect to the live session and its engine acts. A loaded or forked session is a record. */
    readonly live: boolean;
    readonly bus: EventBus;
    readonly eventLog: EventLogStore;
    readonly context: ContextManager;
    readonly registry: Registry;
    readonly scheduler: Scheduler;
    readonly uiState: UIState;

    engines: Record<string, Engine<unknown>> = $state({});
    activeEngine: Engine<unknown>;

    name: string;
    private ondispose: (() => void)[];
    readonly #disposeEffects: () => void;

    constructor(name: string, public readonly userPrefs: UserPrefs, history?: SessionHistory, dialogs?: DialogManager) {
        // a session is identified by its creation, so forks and saved copies keep the ID of the history they came from
        this.id = history ? history.events[0].data.session.id : uuidv4();
        this.name = $state(name);
        this.ondispose = [];
        this.live = !history;
        this.bus = history ? history.bus ?? new EventBus() : EVENT_BUS;
        // raw provider responses stay too: no other event holds them
        this.eventLog = new EventLogStore(this.bus, [...SESSION_KEYS, "app/engines/llm/response"]);
        if (this.live) this.bus.emit('app/session/created', { session: {id: this.id, name: this.name} });
        this.context = new ContextManager(this.eventLog);
        this.registry = new Registry(this);
        // owned here rather than by a component, so records can be built anywhere
        [[this.scheduler, this.uiState], this.#disposeEffects] = withEffectRoot(() => [new Scheduler(this), new UIState(this, dialogs)] as const);
        // a record never prompts its engine: it has no games to act in
        for (const event of history?.events ?? []) this.eventLog.append(event);
        for (const id of Object.keys(this.userPrefs.engines)) {
            this.initEngine(id);
        }
        this.activeEngine = $derived.by(() => this.getEngine(this.userPrefs.app.selectedEngine));
        if (this.live) {
            this.onDispose(this.context.onActorViewAppend((_event, shouldPromptAct) => {
                if (shouldPromptAct) {
                    this.scheduler.requestAct(true);
                }
            }));
        }
    }

    /** A record of this session up to and including `eventId`, or up to now. */
    fork(eventId?: string, name = this.name): Result<Session, string> {
        const [created, ...rest] = this.history();
        const end = eventId === undefined ? rest.length : rest.findIndex(event => event.id === eventId) + 1;
        if (!end && eventId !== undefined && eventId !== created.id) return err("That event is no longer in the session's history");
        return ok(new Session(name, this.userPrefs, { events: [created, ...rest.slice(0, end)] }, this.uiState.dialogs));
    }

    /** Every retained event, oldest first, starting with the session's creation. */
    history(): SessionEvents {
        // the creation is the first event appended and is kept for good
        return this.eventLog.history() as unknown as SessionEvents;
    }

    toFile(): SessionFile {
        return { version: 1, events: this.history() };
    }

    private getEngine(id: string): Engine<unknown> {
        if (!this.engines[id]) {
            this.bus.emit('app/session/engine/not_found', { id });
            id = RANDY_ID;
        }
        return this.engines[id];
    }

    public deleteEngine(id: string) {
        if (id === RANDY_ID || id === OPENROUTER_ID) {
            this.bus.emit('app/session/engine/no_delete_system', { id });
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
        if (this.live) this.bus.emit('app/session/disposed', { session: {id: this.id, name: this.name} });
        this.#disposeEffects();
        this.context.dispose();
        this.eventLog.dispose();
    }

    /** Runs a command on this session, unless it can't run right now. */
    run<I>(command: Command<I>, input: I) {
        const reason = command.unavailable?.(this);
        return reason ? err(reason) : command.run(this, input);
    }

    public initEngine(id?: string): string {
        if (!id) {
            id = uuidv4();
            this.userPrefs.engines[id] = zOpenAIPrefs.decode({ name: "New engine" });
            this.bus.emit('app/session/engine/created', { id });
        }
        this.engines[id] = createEngine(this.userPrefs, id, this.bus);
        if (this.live) this.bus.emit('app/session/engine/initialized', { id });
        return id;
    }
}

export const EVENTS = [
    {
        key: 'app/session/created',
        dataSchema: z.strictObject({ session: z.strictObject({ id: z.string(), name: z.string() }) }),
        description: "Created session",
        level: LogLevel.Debug,
    },
    {
        key: 'app/session/disposed',
        dataSchema: {} as { session: { id: string, name: string } },
        description: "Disposed session",
        level: LogLevel.Info,
    },
    {
        key: 'app/session/engine/not_found',
        dataSchema: {} as { id: string },
        description: "Tried to get engine but it doesn't exist, reverting to Randy",
        level: LogLevel.Error,
    },
    {
        key: 'app/session/engine/no_delete_system',
        dataSchema: {} as { id: string },
        description: "Cannot delete system engine",
        level: LogLevel.Error,
    },
    {
        key: 'app/session/engine/created',
        dataSchema: {} as { id: string },
        description: "Created new engine",
        level: LogLevel.Success,
    },
    {
        key: 'app/session/engine/initialized',
        dataSchema: {} as { id: string },
        description: "Initialized engine",
        level: LogLevel.Debug,
    },
] as const satisfies EventDef<'app/session'>[];

export const DISPLAY = {
    "app/session/engine/not_found": ({ id }) => ({
        title: `Engine ${id} not found, reverting to Randy`,
    }),
    "app/session/engine/no_delete_system": ({ id }) => ({
        title: `Cannot delete system engine ${id}`,
    }),
    "app/session/engine/created": ({ id }) => ({
        title: `Created engine ${id.substring(0, 8)}`,
    }),
} as PresentDefs<Keys<typeof EVENTS>>;
