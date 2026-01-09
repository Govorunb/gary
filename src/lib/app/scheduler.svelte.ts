import type { Session } from "./session.svelte";
import type { Registry } from "$lib/api/registry.svelte";
import r, { LogLevel } from "$lib/app/utils/reporting";
import { zActData, type Action } from "$lib/api/v1/spec";
import { EngineError, type Engine, type EngineAct, type EngineActError, type EngineActResult } from "./engines/index.svelte";
import { err, errAsync, ok, okAsync, ResultAsync } from "neverthrow";
import { untrack } from "svelte";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { debounced } from "./utils";

export class Scheduler {
    /** Explicitly muted by the user through the app UI. */
    public muted = $state(false);
    /** Busy (or simulating a busy state), e.g. waiting for LLM generation or pretending to wait for TTS. */
    public busy = $state(false);
    /** Paused due to an engine error that requires user intervention. */
    public errored = $state(false);
    public readonly canAct: boolean = $derived(!this.muted && !this.busy && !this.errored);

    private readonly registry: Registry;
    #abort: AbortController | null = $state(null);
    /** A signal telling the scheduler to prompt the active engine to act as soon as possible.
     * This can be flipped true by:
     * - Non-silent context messages
     * - Idle timers
     * - Manual user actions
     * And it is flipped false when attempting to act.
     * Note: the act may fail, or the actor may choose not to act; the pending signal is still consumed in either case.
     */
    public actPending = $state(false);
    /** A queue of pending `ForceAction`s. */
    public forceQueue: Array<Action[] | null> = $state([]);
    public readonly autoPoker: AutoPoker;

    constructor(private readonly session: Session) {
        this.registry = this.session.registry;
        $effect(() => {
            if (!this.canAct) return;
            if (this.forceQueue.length) {
                const force = this.forceQueue.shift();
                this.forceAct(force);
            } else if (this.actPending) {
                this.tryAct();
            }
        });
        this.autoPoker = new AutoPoker(session);
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

    public cancelAct(): boolean {
        if (!this.#abort) {
            return false;
        }
        this.#abort.abort();
        r.info("Cancelled acting", {
            toast: true,
            ignoreStackLevels: 1 // log msg is unique, more useful to know who called us
        });
        return true;
    }

    tryAct(): ResultAsync<EngineActResult, EngineActError | ActError> {
        return new ResultAsync(this.actInner(false));
    }

    forceAct(actions?: Action[] | null): ResultAsync<EngineAct, ActError> {
        return new ResultAsync(this.actInner(true, actions))
            .andThen(choice => this.isAct(choice) ? ok(choice)
                : err(new LogicError(`If you see this, DON'T tell me. This is under enough layers of "nobody will ever see this" checks that if you do, I'm NOT going to debug it. I'm just going to retrain to a plumber.`)))
            .finally(() => this.autoPoker.autoAct && this.autoPoker.forceTimer());
    }

    private isAct(choice: EngineActResult): choice is EngineAct {
        return typeof choice === "object" && 'name' in choice;
    }

    private async actInner(force: boolean, actions?: Action[] | null) {
        this.actPending = false;
        const ignores = this.checkIgnored();
        const type = force ? "force" : "try";
        if (ignores.length) {
            r.report(force ? LogLevel.Warning : LogLevel.Info, {
                message: `Scheduler ignored act (${type})`,
                details: ignores.join("; "),
            });
            return err(LogicError.ignored(ignores));
        }

        const actionsProvided = actions !== undefined;
        actions ??= this.registry.games.flatMap(g => g.getActiveActions());
        if (actions.length === 0) {
            r.report(actionsProvided ? LogLevel.Error : LogLevel.Info, {
                message: `Scheduler act (${type}): no actions ${actionsProvided ? "provided" : "registered"}`
            });
            return err(LogicError.noActions());
        }

        const engine = this.activeEngine;

        this.busy = true;
        const controller = new AbortController();
        this.#abort = controller;
        const actRes = force
            ? await this.activeEngine!.forceAct(this.session, actions, controller.signal)
            : await this.activeEngine!.tryAct(this.session, actions, controller.signal);
        this.#abort = null;
        this.busy = false;

        return actRes
            .asyncAndThrough(act => this.perform(act, force, engine))
            .orTee(e => e instanceof EngineError && this.onError(e));
    }
    
    private perform(choice: EngineActResult, force: boolean, engine: Engine<unknown>): ResultAsync<EngineActResult, ActError> {
        if (typeof choice === 'object' && 'name' in choice) {
            return this.performAct(choice, force);
        }
        if (force) {
            return errAsync(new LogicError(`Engine chose to ${choice === "skip" ? choice : "yap"} in forced act. Please don't tell developer or I will cry`));
        }
        if (choice === "skip") {
            // for user display only
            this.session.context.actor({
                text: `Engine chose not to act`,
                silent: true,
                visibilityOverrides: { engine: false },
                customData: { engine: engine.name },
            });
            return okAsync(choice);
        }
        if ('say' in choice) {
            // for user display only
            this.session.context.actor({
                text: `Gary ${choice.notify ? "wants attention" : "says"}: ${choice.say}`,
                silent: !choice.notify,
                visibilityOverrides: { engine: false }
            });
            if (choice.notify) {
                r.info("Gary wants attention", {
                    details: choice.say,
                    toast: true
                });
                sendNotification({
                    title: "Gary wants attention",
                    body: choice.say,
                });
            }
            return okAsync(choice);
        }
        return errAsync(new LogicError(`Reached unreachable fallthrough in 'perform': Did you add a new engine return option?`));
    }

    private performAct(act: EngineAct, forced: boolean): ResultAsync<EngineAct, ActError> {
        const game = this.registry.games.find(g => g.getAction(act.name));
        if (!game) {
            r.error("Engine selected unknown action", {
                toast: {
                    description: `Action: ${act.name}\nThis action was not registered by any game`,
                },
                ctx: {act}
            });
            return errAsync(LogicError.notFound(act.name));
        }
        r.info(`Engine acting ${forced ? "(forced)" : ""}: ${act.name}`);
        const actData = zActData.decode({...act});
        // FIXME: just do events mannnnnnnnnnnnnnn
        this.session.context.actor({
            text: `Act${forced ? " (forced)" : ""}: ${actData.name} (ID ${actData.id.substring(0, 8)})`
                + (actData.data ? `\nData: ${actData.data}` : " (no data)"),
            // user-facing; LLM sees a copy of its own response (LLMEngine.actCore)
            visibilityOverrides: {
                engine: false,
                user: true,
            },
            customData: { actData, game: game.name },
        }, false);
        return ResultAsync.fromPromise(game.sendAction(actData), 
            (e) => (LogicError.sendErr(e as Error))
        )
        .map(() => act);
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

    private onError(err: EngineActError) {
        if (err === "cancelled") {
            // this.muted = true; // TODO: figure out which is the better default
            r.info("Cancelled acting", { toast: true });
            return;
        }
        const errMsg = (err.cause as Error)?.message;
        r.error({
            message: `Engine error: ${err.message}`,
            toast: {
                description: errMsg,
            },
            ctx: {err}
        });
        this.errored = true;
    }

    /** Should only be called through a manual action by the user. */
    public clearError() {
        this.errored = false;
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
        this.tryTimer = $derived(debounced(() => untrack(() => {
            r.info("Engine idle, poking");
            this.scheduler.actPending = true;
            this.tryTimer();
        }), this.tryInterval));

        this.forceTimer = $derived(debounced(() => untrack(() => {
            if (this.scheduler.forceQueue.length === 0) {
                r.info("Engine idle for a long time, force acting");
                this.scheduler.forceQueue.push(null);
            } else {
                r.info("Engine idle but FQ non-empty");
            }
        }), this.forceInterval));

        $effect(() => {
            if (this.autoAct) {
                void this.forceTimer();
            } else {
                this.forceTimer.cancel();
            }
        });
        $effect(() => {
            if (this.autoAct && this.scheduler.canAct && !this.scheduler.actPending && !this.scheduler.forceQueue.length) {
                void this.tryTimer();
            } else {
                this.tryTimer.cancel();
            }
        });
        // HMR
        session.onDispose(() => {
            this.tryTimer.cancel();
            this.forceTimer.cancel();
        });
    }
}
