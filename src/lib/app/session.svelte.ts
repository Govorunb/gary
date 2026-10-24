import { createEngine } from "./engines/create";
import { v4 as uuidv4 } from "uuid";
import { ContextManager } from "./context.svelte";
import { Scheduler } from "./scheduler.svelte";
import type { Engine } from "./engines/index.svelte";
import { Registry } from "#lib/api/registry.svelte.js";
import type { UserPrefs } from "./prefs.svelte";
import { zOpenAIPrefs } from "./engines/llm/openai.svelte";
import { EVENT_BUS } from "./events/bus";
import { ENGINE_ID as RANDY_ID } from "./engines/randy.svelte";
import { ENGINE_ID as OPENROUTER_ID } from "./engines/llm/openrouter.svelte";
import { UIState } from "#lib/ui/app/ui-state.svelte.js";
import type { EventDef, Keys, PresentDefs } from "./events";
import { LogLevel, parseError } from "./utils";
import { EventLogStore } from "./events/log.svelte";
import { err, ok, type Result } from "neverthrow";
import type { Command } from "./commands";

/**
 * Represents a user session within the app.
 *
 * Maybe in the future the app can save/load sessions, or run multiple at once, or something.
 * For now, it's just a "DI root"/"manager manager" kind of thing.
 *
 * It's also the command service: anything the user can do to the session goes through a method here,
 * so the UI and external transports (MCP) share one path.
 */
export class Session {
    readonly id: string;
    readonly eventLog: EventLogStore;
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
        this.eventLog = new EventLogStore();
        this.context = new ContextManager(this.eventLog);
        this.registry = new Registry(this);
        this.scheduler = new Scheduler(this);
        this.uiState = new UIState(this);
        EVENT_BUS.emit('app/session/created', { session: {id: this.id, name: this.name} });
        for (const id of Object.keys(this.userPrefs.engines)) {
            this.initEngine(id);
        }
        this.activeEngine = $derived.by(() => this.getEngine(this.userPrefs.app.selectedEngine));
        this.onDispose(this.context.onActorViewAppend((_event, shouldPromptAct) => {
            if (shouldPromptAct) {
                this.scheduler.requestAct(true);
            }
        }));
    }

    private getEngine(id: string): Engine<unknown> {
        if (!this.engines[id]) {
            EVENT_BUS.emit('app/session/engine/not_found', { id });
            id = RANDY_ID;
        }
        return this.engines[id];
    }

    public deleteEngine(id: string) {
        if (id === RANDY_ID || id === OPENROUTER_ID) {
            EVENT_BUS.emit('app/session/engine/no_delete_system', { id });
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
        EVENT_BUS.emit('app/session/disposed', { session: {id: this.id, name: this.name} });
        this.context.dispose();
        this.eventLog.dispose();
    }

    /** Runs a command on this session, unless it can't run right now. */
    run<I>(command: Command<I>, input: I) {
        const reason = command.unavailable?.(this);
        return reason ? err(reason) : command.run(this, input);
    }

    /** Sends an action to a game as the user (Tony mode), bypassing the engine. */
    sendAction(gameId: string, actionName: string, data?: string): Result<void, string> {
        const game = this.registry.getGame(gameId);
        if (!game) return err(`'${gameId}' doesn't match exactly one game ID`);
        if (!game.getAction(actionName, false)) return err(`${game.name} has no action '${actionName}'`);
        if (this.scheduler.busy) return err("The engine is busy acting");
        const evtData = { gameId: game.id, actionName };
        EVENT_BUS.emit('ui/game/user_act/send', { ...evtData, hasData: !!data });
        game.manualSend(actionName, data)
            .catch(e => EVENT_BUS.emit('ui/game/user_act/send_error', { ...evtData, error: parseError(e) }));
        return ok();
    }

    /** Prompts the active engine to act now. Also resumes an engine paused on an error. */
    act(force: boolean): Result<void, string> {
        this.scheduler.clearError();
        if (this.scheduler.busy) return err("The engine is busy acting");
        void (force ? this.scheduler.forceAct() : this.scheduler.tryAct());
        return ok();
    }

    selectEngine(id: string): Result<void, string> {
        if (!Object.hasOwn(this.engines, id)) return err(`No engine with ID '${id}'`);
        this.userPrefs.app.selectedEngine = id;
        return ok();
    }

    clearContext() {
        EVENT_BUS.emit('ui/context/reset');
    }

    public initEngine(id?: string): string {
        if (!id) {
            id = uuidv4();
            this.userPrefs.engines[id] = zOpenAIPrefs.decode({ name: "New engine" });
            EVENT_BUS.emit('app/session/engine/created', { id });
        }
        this.engines[id] = createEngine(this.userPrefs, id);
        EVENT_BUS.emit('app/session/engine/initialized', { id });
        return id;
    }
}

export const EVENTS = [
    {
        key: 'app/session/created',
        dataSchema: {} as { session: { id: string, name: string } },
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
