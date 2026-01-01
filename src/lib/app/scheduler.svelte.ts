import type { Session } from "./session.svelte";
import type { Registry } from "$lib/api/registry.svelte";
import r from "$lib/app/utils/reporting";
import { zActData, type Action } from "$lib/api/v1/spec";
import type { EngineError, Engine, EngineAct } from "./engines/index.svelte";
import { err, errAsync, ok, type Result, ResultAsync } from "neverthrow";
import { useDebounce } from "runed";
import { untrack } from "svelte";

export class Scheduler {
    /** Explicitly muted by the user through the app UI. */
    public muted = $state(false);
    /** Busy (or simulating a busy state), e.g. waiting for LLM generation or pretending to wait for TTS. */
    public busy = $state(false);
    /** Paused due to an engine error that requires user intervention. */
    public errored = $state(false); // TODO: first time teaching tip
    public readonly canAct: boolean = $derived(!this.muted && !this.busy && !this.errored);

    private readonly registry: Registry;
    private activeEngine: Engine<unknown> | null;
    public readonly activeMutes: string[];
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
        this.activeEngine = $derived(this.session.activeEngine);
        this.activeMutes = $derived.by(() => [
            this.muted && "muted",
            this.busy && "busy",
            this.errored && "paused due to error",
        ].filter(Boolean) as string[]);
        $effect(() => {
            if (!this.canAct) return;
            if (this.forceQueue.length) {
                // don't unqueue until we've finished processing it (helps diagnostics)
                const force = this.forceQueue[0];
                this.forceAct(force)
                    .finally(() => {
                        if (force === this.forceQueue[0]) {
                            this.forceQueue.unshift();
                        }
                    });
            } else if (this.actPending) {
                this.tryAct();
            }
        });
        this.autoPoker = new AutoPoker(session);
    }

    async tryAct(): Promise<Result<EngineAct | null, ActError>> {
        this.actPending = false;
        const ignores = this.checkIgnored();
        if (ignores.length) {
            r.debug(`Scheduler.tryAct ignored - ${ignores.join("; ")}`);
            return err({type: "ignored", ignores});
        }

        const actions = this.registry.games.flatMap(g => g.getActiveActions());
        if (actions.length === 0) {
            return err({type: "noActions"});
        }
        this.busy = true;
        const actRes = await this.activeEngine!.tryAct(this.session, actions);
        this.busy = false;
        if (actRes.isErr()) {
            this.onError(actRes.error);
            return err(actRes.error);
        }
        const act = actRes.value;
        if (!act) {
            r.debug(`Scheduler.tryAct: engine chose not to act`);
            return ok(null);
        }
        return this.doAct(act, false);
    }

    async forceAct(actions?: Action[] | null): Promise<Result<EngineAct, ActError>> {
        this.actPending = false;
        const ignores = this.checkIgnored();
        if (ignores.length) {
            r.warn(`Scheduler.forceAct ignored - ${ignores.join("; ")}`);
            return err({type: "ignored", ignores});
        }
        
        const actionsProvided = actions !== undefined;
        actions ??= this.registry.games.flatMap(g => g.getActiveActions());
        if (actions.length === 0) {
            const logMethod = actionsProvided ? r.error : r.info;
            logMethod.bind(r)(`Scheduler.forceAct: no actions ${actionsProvided ? "provided" : "registered"}`);
            return err({type: "noActions"});
        }
        this.busy = true;
        const actRes = await this.activeEngine!.forceAct(this.session, actions);
        this.busy = false;
        if (actRes.isErr()) {
            this.onError(actRes.error);
            return err(actRes.error);
        }
        const act = actRes.value;
        return this.doAct(act, true);
    }

    private doAct(act: EngineAct, forced: boolean): ResultAsync<EngineAct, ActError> {
        if (this.autoPoker.autoAct) {
            this.autoPoker.forceTimer();
        }
        const game = this.registry.games.find(g => g.getAction(act.name));
        if (!game) {
            r.error("Engine selected unknown action", {
                toast: {
                    description: `Action: ${act.name}\nThis action was not registered by any game`,
                },
                ctx: {act}
            });
            return errAsync({type: "actionNotFound", action: act.name});
        }
        r.info(`Engine acting ${forced ? "(forced)" : ""}: ${act.name}`);
        const actData = zActData.decode({...act});
        // FIXME: just do events mannnnnnnnnnnnnnn
        this.session.context.actor({
            text: `Act${forced ? " (forced)" : ""}: ${actData.name}`,
            // user-facing; LLM sees a copy of its own response (LLMEngine.actCore)
            visibilityOverrides: {
                engine: false,
                user: true,
            },
            customData: { actData },
        }, false);
        return ResultAsync.fromPromise(game.sendAction(actData), 
            (e) => ({type: "connError", error: `Failed to send act: ${e}`} as const)
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

    private onError(err: EngineError) {
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

export type ActError = Ignored | NoActions | ActionNotFound | EngineError | ConnError;

export type Ignored = {
    type: "ignored";
    ignores: string[];
};
export type NoActions = {
    type: "noActions";
};
export type ActionNotFound = {
    type: "actionNotFound";
    action: string;
};
export type ConnError = {
    type: "connError";
    error: string;
}

export class AutoPoker {
    public autoAct = $state(false);
    public tryInterval = $state(5000);
    public forceInterval = $state(30000);
    public readonly tryTimer: ReturnType<typeof useDebounce<[], void>>;
    public readonly forceTimer: ReturnType<typeof useDebounce<[], void>>;

    private readonly scheduler: Scheduler;

    constructor(private session: Session) {
        this.scheduler = $derived(this.session.scheduler);
        this.tryTimer = useDebounce(() => {
            r.info("Engine idle, poking");
            this.scheduler.actPending = true;
            void this.tryTimer();
        }, () => this.tryInterval);
        
        this.forceTimer = useDebounce(() => {
            r.info("Engine idle for a long time, force acting");
            if (this.scheduler.forceQueue.length === 0) {
                this.scheduler.forceQueue.push(null);
            }
        }, () => this.forceInterval);

        $effect(() => {
            if (!this.autoAct) {
                untrack(() => this.forceTimer.cancel());
                untrack(() => this.tryTimer.cancel());
            } else {
                untrack(() => void this.tryTimer());
                untrack(() => void this.forceTimer());

                if (this.scheduler.canAct && !this.scheduler.actPending && !this.scheduler.forceQueue.length) {
                    untrack(() => void this.tryTimer());
                } else {
                    untrack(() => this.tryTimer.cancel());
                }
            }
        });
        // HMR
        session.onDispose(() => {
            this.tryTimer.cancel();
            this.forceTimer.cancel();
            // @ts-expect-error
            this.tryTimer = null as any;
            // @ts-expect-error
            this.forceTimer = null as any;
        });
    }
}
