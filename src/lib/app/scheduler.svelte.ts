import type { Session } from "./session.svelte";
import type { Registry } from "$lib/api/registry.svelte";
import r from "$lib/app/utils/reporting";
import { zAct, zActData, type Action } from "$lib/api/v1/spec";
import type { EngineError, Engine, EngineAct } from "./engines/index.svelte";
import { err, errAsync, ok, type Result, ResultAsync } from "neverthrow";
import { OpenRouterError } from "@openrouter/sdk/models/errors";
import { useDebounce } from "runed";
import { untrack } from "svelte";

export class Scheduler {
    /** Explicitly muted by the user through the app UI. */
    public muted = $state(false);
    /** Busy (or simulating a busy state), e.g. waiting for LLM generation or pretending to wait for TTS. */
    public busy = $state(false); // TODO: show in UI (badge/status bar)
    /** Paused due to an engine error that requires user intervention. */
    public errored = $state(false); // TODO: first time teaching tip
    public readonly canAct: boolean = $derived(!this.muted && !this.busy && !this.errored);

    private readonly registry: Registry;
    private activeEngine: Engine<unknown> | null;
    public readonly activeMutes: string[];
    /** A signal telling the scheduler to prompt the active engine to act as soon as possible.
     * This can be flipped true by:
     * - Non-silent context messages
     * - Idle timers (TODO)
     * - Manual user actions
     * And it is flipped false when attempting to act.
     * Note: the act may fail, or the actor may choose not to act; the pending signal is still consumed in either case.
     */
    public actPending = $state(false);
    /** A queue of pending `ForceAction`s. */
    public forceQueue: Action[][] = $state([]);
    public autoAct = $state(false);
    public tryInterval = $state(5000);
    public forceInterval = $state(30000);
    public readonly tryTimer: ReturnType<typeof useDebounce<[], void>>;
    public readonly forceTimer: ReturnType<typeof useDebounce<[], void>>;

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
                this.forceAct(this.forceQueue.shift());
            } else if (this.actPending) {
                this.tryAct();
            }
        });
        this.tryTimer = useDebounce(() => {
            r.info("Engine idle, poking");
            void this.tryAct().finally(() => void this.tryTimer());
        }, () => this.tryInterval);
        this.forceTimer = useDebounce(() => {
            r.info("Engine idle for a long time, force acting");
            void this.forceAct().finally(() => void this.forceTimer());
        }, () => this.forceInterval);
        // HMR
        session.onDispose(() => {
            this.tryTimer.cancel();
            this.forceTimer.cancel();
            // @ts-expect-error
            this.tryTimer = null as any;
            // @ts-expect-error
            this.forceTimer = null as any;
        });
        $effect(() => {
            if (!this.autoAct) {
                untrack(() => this.forceTimer.cancel());
                untrack(() => this.tryTimer.cancel());
            } else {
                untrack(() => void this.tryTimer());
                untrack(() => void this.forceTimer());

                if (this.canAct && !this.actPending && !this.forceQueue.length) {
                    untrack(() => void this.tryTimer());
                } else {
                    untrack(() => this.tryTimer.cancel());
                }
            }
        })
    }

    async tryAct(): Promise<Result<EngineAct | null, ActError>> {
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
        this.actPending = false;
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

    async forceAct(actions?: Action[]): Promise<Result<EngineAct, ActError>> {
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
        this.actPending = false;
        if (actRes.isErr()) {
            this.onError(actRes.error);
            return err(actRes.error);
        }
        const act = actRes.value;
        return this.doAct(act, true);
    }

    private doAct(act: EngineAct, forced: boolean): ResultAsync<EngineAct, ActError> {
        this.forceTimer();
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
        // FIXME: xd
        this.session.context.actor({
            text: `Act${forced ? " (forced)" : ""}: ${JSON.stringify(actData)}`,
            visibilityOverrides: {
                engine: false,
            }
        }, false);
        return ResultAsync.fromPromise(
            game.conn.send(zAct.decode({data: actData})),
            (e) => ({type: "connError", error: `Failed to send act: ${e}`} as const),
        ).map(() => act);
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
        let errMsg = (err.cause as Error)?.message;
        // FIXME: ew
        if (err.cause instanceof OpenRouterError) {
            errMsg += `: ${err.cause.body}`;
        }
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
