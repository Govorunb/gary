import type { Session } from "./session.svelte";
import type { Game, QueuedGameForce } from "$lib/api/game.svelte";
import type { Registry } from "$lib/api/registry.svelte";
import { FORCE_PRIORITY, zActData, type Action, type ForcePriority } from "$lib/api/v1/spec";
import { EngineError, type Engine, type EngineAct, type EngineActError, type EngineActResult } from "./engines/index.svelte";
import { err, errAsync, ok, okAsync, ResultAsync } from "neverthrow";
import { debounced, LogLevel } from "./utils";
import type { EventDef, Keys, PresentDefs } from "./events";
import { EVENT_BUS } from "./events/bus";
import { toast } from "svelte-sonner";

export type ActionCandidate = {
    game: Game;
    action: Action;
};

type EngineActionTarget = ActionCandidate & {
    displayName: string;
    engineAction: Action;
};

type EngineActionSet = {
    actions: Action[];
    targetsByName: Map<string, EngineActionTarget>;
};

const MAX_CONSECUTIVE_RECOVERABLE_ERRORS = 5;
const PENDING_ACT_GRACE_MS = 100;

export class Scheduler {
    /** Explicitly muted by the user through the app UI. */
    #muted = $state(false);
    /** Busy (or simulating a busy state), e.g. waiting for LLM generation or pretending to wait for TTS. */
    #busy = $state(false);
    /** Paused due to an engine error that requires user intervention. */
    #errored = $state(false);
    public readonly canAct: boolean = $derived(!this.#muted && !this.#busy && !this.#errored);

    private readonly registry: Registry;
    #abort: AbortController | null = $state(null);
    #activePriority: ForcePriority | null = null;
    #failedEngine: Engine<unknown> | null = null;
    #consecutiveEngineErrors = 0;
    /** A signal telling the scheduler to prompt the active engine to act as soon as possible.
     * This can be flipped true by:
     * - Non-silent context messages
     * - Idle timers
     * - Manual user actions
     * And it is flipped false when attempting to act.
     * Note: the act may fail, or the actor may choose not to act; the pending signal is still consumed in either case.
     */
    #actPending = $state(false);
    /** Manual and auto-act forces. Client forces are owned by their games. */
    public forceQueue: Array<ActionCandidate[] | null> = $state([]);
    public readonly autoPoker: AutoPoker;
    private readonly pendingActTimer: ReturnType<typeof debounced>;
    #drainQueued = false;
    #disposed = false;

    constructor(private readonly session: Session) {
        this.registry = this.session.registry;
        this.pendingActTimer = debounced(() => {
            this.#actPending = true;
            this.requestDrain();
        }, PENDING_ACT_GRACE_MS);
        session.onDispose(() => {
            this.#disposed = true;
            this.pendingActTimer.cancel();
        });
        this.autoPoker = new AutoPoker(session);
    }

    public get muted() {
        return this.#muted;
    }

    public get busy() {
        return this.#busy;
    }

    public get errored() {
        return this.#errored;
    }

    public get actPending() {
        return this.#actPending;
    }

    public toggleMuted() {
        this.#muted = !this.#muted;
        this.requestDrain();
    }

    private requestDrain() {
        if (this.#disposed || this.#drainQueued) return;
        this.#drainQueued = true;
        queueMicrotask(() => {
            this.#drainQueued = false;
            if (!this.#disposed) this.drain();
        });
    }

    private drain() {
        if (!this.canAct) return;
        const gameForce = this.takeGameForce();
        if (gameForce) {
            this.forceGame(gameForce.game, gameForce.force);
        } else if (this.forceQueue.length) {
            const force = this.forceQueue.shift();
            this.forceAct(force);
        } else if (this.#actPending) {
            this.tryAct();
        }
    }
    public get activeMutes() {
        return [
            this.muted && "muted",
            this.busy && "busy",
            this.errored && "paused due to error",
        ].filter(Boolean) as string[]
    }
    public get activeEngine() {
        return this.session.activeEngine;
    }
    public get hasPendingForce() {
        return this.forceQueue.length > 0 || this.registry.games.some(game => game.hasForce);
    }
    public queueForce(actions: ActionCandidate[] | null) {
        this.forceQueue.push(actions);
        this.requestDrain();
    }

    public requestAct(graceIfNoActions = false) {
        if (graceIfNoActions && this.activeActionCandidates().length === 0) {
            this.pendingActTimer();
        } else {
            this.pendingActTimer.cancel();
            this.#actPending = true;
            this.requestDrain();
        }
    }

    public onGameForce(priority: ForcePriority) {
        if (this.#abort && this.#activePriority !== null
            && FORCE_PRIORITY[priority] > FORCE_PRIORITY[this.#activePriority]) {
            this.#abort.abort();
        }
        this.requestDrain();
    }

    public cancelAct(): boolean {
        if (!this.#abort) {
            return false;
        }
        this.#abort.abort();
        EVENT_BUS.emit('app/scheduler/act/cancelled');
        return true;
    }

    tryAct(): ResultAsync<EngineActResult, EngineActError | ActError> {
        return new ResultAsync(this.actInner(false));
    }

    forceAct(actions?: ActionCandidate[] | null): ResultAsync<EngineAct, ActError> {
        return new ResultAsync(this.actInner(true, actions))
            .andThen(choice => this.isAct(choice) ? ok(choice)
                : err(new LogicError(`If you see this, DON'T tell me. This is under enough layers of "nobody will ever see this" checks that if you do, I'm NOT going to debug it. I'm just going to retrain to a plumber.`)))
            .finally(() => this.autoPoker.autoAct && this.autoPoker.forceTimer());
    }

    private isAct(choice: EngineActResult): choice is EngineAct {
        return typeof choice === "object" && 'name' in choice;
    }

    private forceGame(game: Game, force: QueuedGameForce) {
        const candidates = force.actions.map(action => ({ game, action }));
        new ResultAsync(this.actInner(true, candidates, force.data, force.data.priority))
            .finally(() => {
                game.completeForce();
                if (this.autoPoker.autoAct) this.autoPoker.forceTimer();
            });
    }

    private takeGameForce(): { game: Game; force: QueuedGameForce } | null {
        let selected: Game | null = null;
        for (const game of this.registry.games) {
            if (game.nextForcePriority === null) continue;
            if (!selected || FORCE_PRIORITY[game.nextForcePriority] > FORCE_PRIORITY[selected.nextForcePriority!]) {
                selected = game;
            }
        }
        return selected ? { game: selected, force: selected.takeForce()! } : null;
    }

    private async actInner(
        force: boolean,
        candidates?: ActionCandidate[] | null,
        forceContext?: QueuedGameForce["data"],
        priority: ForcePriority = "low",
    ) {
        this.pendingActTimer.cancel();
        this.#actPending = false;
        const ignores = this.checkIgnored();
        if (ignores.length) {
            EVENT_BUS.emit('app/scheduler/act/fail/ignored', { force, ignores });
            return err(LogicError.ignored(ignores));
        }

        const actionsProvided = candidates !== undefined && candidates !== null;
        candidates ??= this.activeActionCandidates();
        if (candidates.length === 0) {
            EVENT_BUS.emit('app/scheduler/act/fail/no_actions', { force, actionsProvided });
            if (actionsProvided) {
                toast.error("No actions provided");
            }
            return err(LogicError.noActions());
        }
        const actionSet = this.engineActionSet(candidates);

        const engine = this.activeEngine;

        this.#busy = true;
        const controller = new AbortController();
        this.#abort = controller;
        this.#activePriority = priority;
        const actRes = force
            ? await this.activeEngine!.forceAct(this.session, actionSet.actions, controller.signal, forceContext)
            : await this.activeEngine!.tryAct(this.session, actionSet.actions, controller.signal);
        this.#abort = null;
        this.#activePriority = null;
        if (actRes.isOk()) {
            this.resetEngineErrors();
        }
        const result = await actRes
            .asyncAndThrough(act => this.perform(act, force, engine, actionSet.targetsByName))
            .orTee(e => e instanceof EngineError && this.onError(e, engine));
        this.#busy = false;
        this.requestDrain();
        return result;
    }

    private activeActionCandidates(): ActionCandidate[] {
        return this.registry.games.flatMap(game =>
            game.getActiveActions().map(action => ({ game, action }))
        );
    }

    private engineActionSet(candidates: ActionCandidate[]): EngineActionSet {
        const actionNameCounts = new Map<string, number>();
        for (const { action } of candidates) {
            actionNameCounts.set(action.name, (actionNameCounts.get(action.name) ?? 0) + 1);
        }

        const displayNames = new Array<string>(candidates.length);
        const usedNames = new Set<string>();

        for (let i = 0; i < candidates.length; i++) {
            const { action } = candidates[i];
            if (actionNameCounts.get(action.name) === 1) {
                displayNames[i] = action.name;
                usedNames.add(action.name);
            }
        }

        for (let i = 0; i < candidates.length; i++) {
            const { game, action } = candidates[i];
            if (displayNames[i]) {
                continue;
            }

            const baseName = `${action.name} (${game.name} ${game.shortId})`;
            let displayName = baseName;
            let duplicateSuffix = 2;
            while (usedNames.has(displayName)) {
                displayName = `${baseName} #${duplicateSuffix}`;
                duplicateSuffix++;
            }
            displayNames[i] = displayName;
            usedNames.add(displayName);
        }

        const actions: Action[] = [];
        const targetsByName = new Map<string, EngineActionTarget>();
        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            const displayName = displayNames[i];
            const engineAction = { ...candidate.action, name: displayName };
            actions.push(engineAction);
            targetsByName.set(displayName, {
                ...candidate,
                displayName,
                engineAction,
            });
        }

        return { actions, targetsByName };
    }

    private perform(choice: EngineActResult, force: boolean, engine: Engine<unknown>, targetsByName: Map<string, EngineActionTarget>): ResultAsync<EngineActResult, ActError> {
        if (typeof choice === 'object' && 'name' in choice) {
            return this.performAct(choice, force, engine, targetsByName);
        }
        if (force) {
            return errAsync(new LogicError(`Engine chose to ${choice === "skip" ? choice : "yap"} in forced act. Please don't tell the developer. I will cry`));
        }
        if (choice === "skip") {
            EVENT_BUS.emit('api/actor/skip', { engineId: engine.id });
            return okAsync(choice);
        }
        if ('say' in choice) {
            EVENT_BUS.emit('app/scheduler/act/say', { ...choice });
            EVENT_BUS.emit('api/actor/say', {
                engineId: engine.id,
                msg: choice.say,
                notify: choice.notify,
            });
            if (choice.notify) {
                toast.info(`Gary says: ${choice.say}`);
            }
            return okAsync(choice);
        }
        return errAsync(new LogicError(`Reached unreachable fallthrough in 'perform': Did you add a new engine return option?`));
    }

    private performAct(act: EngineAct, forced: boolean, engine: Engine<unknown>, targetsByName: Map<string, EngineActionTarget>): ResultAsync<EngineAct, ActError> {
        const target = targetsByName.get(act.name);
        if (!target) {
            EVENT_BUS.emit('app/scheduler/act/fail/action_not_found', { force: forced, act });
            return errAsync(LogicError.notFound(act.name));
        }
        const game = target.game;
        const realAct: EngineAct = { ...act, name: target.action.name };
        EVENT_BUS.emit('app/scheduler/act/perform', { force: forced, action: realAct.name });
        const actData = zActData.decode({ name: realAct.name, data: realAct.data });
        EVENT_BUS.emit('api/actor/act', {
            engineId: engine.id,
            force: forced,
            game: game.name,
            act: actData,
        });
        return ResultAsync.fromPromise(game.sendAction(actData, act.toolCallId), (e) => LogicError.sendErr(e as Error))
            .orTee(() => EVENT_BUS.emit('app/scheduler/act/fail/failed_to_send', { force: forced }))
            .map(() => realAct);
    }

    private checkIgnored() {
        const out = [];
        // const mutes = Array.from(this.mutes.entries().filter(([_, v]) => v));
        // if (mutes.length) {
        //     out.push(`muted: ${mutes.map(([k]) => k).join(", ")}`);
        // }
        if (!this.canAct) {
            out.push(`cannot act (${this.activeMutes.join(", ")})`);
        }
        if (!this.activeEngine) {
            out.push(`no loaded engine`);
        }
        return out;
    }

    private onError(err: EngineError, engine: Engine<unknown>) {
        if (this.#failedEngine !== engine) {
            this.#failedEngine = engine;
            this.#consecutiveEngineErrors = 0;
        }
        this.#consecutiveEngineErrors++;
        const paused = !err.recoverable
            || this.#consecutiveEngineErrors >= MAX_CONSECUTIVE_RECOVERABLE_ERRORS;
        const errMsg = (err.cause as Error)?.message;
        EVENT_BUS.emit('app/scheduler/act/error', {
            message: err.message,
            cause: errMsg,
            recoverable: err.recoverable,
            consecutiveErrors: this.#consecutiveEngineErrors,
            paused,
        });
        this.#errored = paused;
    }

    private resetEngineErrors() {
        this.#failedEngine = null;
        this.#consecutiveEngineErrors = 0;
    }

    /** Should only be called through a manual action by the user. */
    public clearError() {
        this.#errored = false;
        this.resetEngineErrors();
        this.requestDrain();
    }
}

export type ActError = LogicError | EngineError | Cancelled;

export class LogicError extends Error {
    static ignored(ignores: string[]) {
        return new LogicError(`Ignored: [${ignores.join(",")}]`);
    }
    static noActions() {
        return new LogicError(`No actions available`);
    }
    static notFound(action: string) {
        return new LogicError(`Action '${action}' not found in any connected games`);
    }
    static sendErr(err: Error) {
        return new LogicError(`Failed to send act`, { cause: err });
    }
}
export type Cancelled = "cancelled";

export class AutoPoker {
    public autoAct = $state(false);
    public tryInterval = $state(5000);
    public forceInterval = $state(30000);
    public readonly tryTimer: ReturnType<typeof debounced>;
    public readonly forceTimer: ReturnType<typeof debounced>;

    private get scheduler() {
        return this.session.scheduler;
    }

    constructor(private session: Session) {
        this.tryTimer = debounced(() => {
            EVENT_BUS.emit('app/scheduler/idle/try');
            this.scheduler.requestAct();
            this.tryTimer();
        }, () => this.tryInterval);
        
        this.forceTimer = debounced(() => {
            if (!this.scheduler.hasPendingForce) {
                EVENT_BUS.emit('app/scheduler/idle/force');
                this.scheduler.queueForce(null);
            } else {
                EVENT_BUS.emit('app/scheduler/idle/no_fq');
            }
        }, () => this.forceInterval);

        $effect(() => {
            if (this.autoAct) {
                void this.forceTimer();
            } else {
                this.forceTimer.cancel();
            }
            return () => this.forceTimer.cancel();
        });
        $effect(() => {
            if (this.autoAct && this.scheduler.canAct && !this.scheduler.actPending && !this.scheduler.hasPendingForce) {
                void this.tryTimer();
            } else {
                this.tryTimer.cancel();
            }
            return () => this.tryTimer.cancel();
        });
        // HMR
        session.onDispose(() => {
            this.tryTimer.cancel();
            this.forceTimer.cancel();
        });
    }
}

export const EVENTS = [
    {
        key: 'app/scheduler/act/cancelled',
        level: LogLevel.Info,
    },
    {
        key: 'app/scheduler/act/fail/ignored',
        dataSchema: {} as { force: boolean; ignores: string[]; },
        description: "Scheduler ignored an act request",
        level: LogLevel.Info,
    },
    {
        key: 'app/scheduler/act/fail/no_actions',
        dataSchema: {} as { force: boolean; actionsProvided?: boolean; },
        description: "Scheduler could not act because no actions were available",
        level: LogLevel.Info,
    },
    {
        key: 'app/scheduler/act/fail/action_not_found',
        dataSchema: {} as { force: boolean; act: EngineAct; },
        level: LogLevel.Error,
    },
    {
        key: 'app/scheduler/act/fail/failed_to_send',
        dataSchema: {} as { force: boolean; },
        description: "Scheduler failed to send the selected action",
        level: LogLevel.Error,
    },
    {
        key: 'app/scheduler/act/say',
        dataSchema: {} as { say: string; notify: boolean; },
        description: "Actor decided to speak",
        level: LogLevel.Info,
    },
    {
        key: 'app/scheduler/act/perform',
        dataSchema: {} as { force: boolean; action: string; },
        description: "Engine acting",
        level: LogLevel.Info,
    },
    {
        key: 'app/scheduler/act/performing',
        dataSchema: {} as { force: boolean; result: EngineActResult; },
        level: LogLevel.Debug,
    },
    {
        key: 'app/scheduler/act/error',
        dataSchema: {} as {
            message: string;
            cause?: string;
            recoverable: boolean;
            consecutiveErrors: number;
            paused: boolean;
        },
        description: "Engine error during acting",
        level: LogLevel.Error,
    },
    {
        key: 'app/scheduler/idle/try',
        description: "Engine idle, poking",
        level: LogLevel.Info,
    },
    {
        key: 'app/scheduler/idle/force',
        description: "Engine idle for a while, force acting",
        level: LogLevel.Info,
    },
    {
        key: 'app/scheduler/idle/no_fq',
        description: "Engine idle but force already queued (stalled?)",
        level: LogLevel.Info,
    },
] as const satisfies EventDef<'app/scheduler'>[];

export const DISPLAY = {
    "app/scheduler/act/cancelled": () => ({
        title: "Cancelled acting",
        level: LogLevel.Success
    }),
    "app/scheduler/act/fail/action_not_found": ({ act }) => ({
        title: `Engine selected unknown action: ${act.name}\nThis action was not registered by any game`,
    }),
    "app/scheduler/act/error": ({ message, cause }) => ({
        title: `Engine error: ${message}`,
        description: cause,
    }),
} as PresentDefs<Keys<typeof EVENTS>>;

// FIXME: move to lib/app/engines
export const ACT_EVENTS = [
    {
        key: 'api/actor/skip',
        dataSchema: {} as { engineId: string; },
        description: "Actor skipped acting",
        level: LogLevel.Info,
    },
    {
        key: 'api/actor/say',
        dataSchema: {} as { engineId: string; msg: string; notify: boolean; },
        description: "Actor spoke",
        level: LogLevel.Info,
    },
    {
        key: 'api/actor/act',
        dataSchema: {} as {
            engineId: string;
            force: boolean;
            game: string;
            act: ReturnType<typeof zActData.decode>;
        },
        description: "Actor selected an action",
        level: LogLevel.Info,
    },
    {
        key: 'api/actor/generated',
        dataSchema: {} as {
            engineId: string;
            text: string;
            toolCall?: {
                id: string;
                name: string;
                arguments: string;
            };
            metadata?: {
                reasoning?: unknown;
                usage?: unknown;
                response?: unknown;
            };
        },
        description: "Actor generated text",
        level: LogLevel.Info,
    },
    {
        key: 'api/actor/tool_error',
        dataSchema: {} as {
            engineId: string;
            text: string;
            toolCalls: Array<{
                id: string;
                name: string;
                arguments: string;
            }>;
            message: string;
        },
        description: "Actor made an invalid tool call",
        level: LogLevel.Info,
    }
] as const satisfies EventDef<'api/actor'>[];
