import type { Session } from "./session.svelte";
import type { Registry } from "$lib/api/registry.svelte";
import r from "$lib/app/utils/reporting";
import { zAct, zActData, type Action } from "$lib/api/v1/spec";
import { EngineError, type Engine } from "./engines/index.svelte";
import { err, ok } from "neverthrow";

export class Scheduler {
    /** Explicitly muted, e.g. through the app UI. */
    public muted = $state(false); // TODO: expose in UI (button next to poke/force)
    /** Simulating a busy state, e.g. pretending to wait for TTS. */
    public sleeping = $state(false); // TODO: badge on engine picker
    /** Paused due to an engine error that requires user intervention. */
    public errored = $state(false); // TODO: surface in UI (replace mute button) (+ first time teaching tip)
    public readonly canAct: boolean = $derived(!this.muted && !this.sleeping && !this.errored);

    private readonly registry: Registry;
    private activeEngine: Engine<any> | null;
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

    constructor(private readonly session: Session) {
        this.registry = this.session.registry;
        this.activeEngine = $derived(this.session.activeEngine);
        this.activeMutes = $derived.by(() => {
            const out = [];
            if (this.muted) {
                out.push('muted');
            }
            if (this.sleeping) {
                out.push('sleeping');
            }
            if (this.errored) {
                out.push('paused due to error');
            }
            return out;
        });
        $effect(() => {
            if (this.canAct && this.actPending) {
                this.tryAct();
            }
        });
    }

    async tryAct() {
        const ignores = this.checkIgnored();
        if (ignores.length) {
            r.debug(`Scheduler.tryAct ignored - ${ignores.join("; ")}`);
            return err({type: "ignored", ignores});
        }

        const actions = this.registry.games.flatMap(g => Array.from(g.actions.values()));
        if (actions.length === 0) {
            return err({type: "noActions"});
        }
        const actRes = await this.activeEngine!.tryAct(this.session, actions);
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
        const game = this.registry.games.find(g => g.actions.has(act.name));
        if (game) {
            r.info(`Engine acting: ${act.name}`);
            const actData = zActData.decode({...act});
            await game.conn.send(zAct.decode({data: actData}));
        } else {
            r.error("Engine selected unknown action", {
                toast: {
                    description: `Action name: ${act.name}\nThis action was not registered by any game`,
                },
                ctx: {act}
            });
        }
    }

    async forceAct(actions?: Action[]) {
        const ignores = this.checkIgnored();
        if (ignores.length) {
            r.warn(`Scheduler.forceAct ignored - ${ignores.join("; ")}`);
            return err({type: "ignored", ignores});
        }
        
        const actionsProvided = actions !== undefined;
        actions ??= this.registry.games.flatMap(g => Array.from(g.actions.values()));
        if (actions.length === 0) {
            const logMethod = actionsProvided ? r.error : r.info;
            logMethod.bind(r)(`Scheduler.forceAct: no actions ${actionsProvided ? "provided" : "registered"}`);
            return err({type: "noActions"});
        }
        const actRes = await this.activeEngine!.forceAct(this.session, actions);
        this.actPending = false;
        if (actRes.isErr()) {
            this.onError(actRes.error);
            return err(actRes.error);
        }
        const act = actRes.value;
        const game = this.registry.games.find(g => g.actions.has(act.name));
        if (!game) {
            r.error("Engine selected unknown action", {
                toast: {
                    description: `Action: ${act.name}\nThis action was not registered by any game`,
                },
                ctx: {act}
            });
            return err({type: "actionNotFound", action: act.name});
        }
        r.info(`Engine acting (forced): ${act.name}`);
        await game.conn.send(zAct.decode({data: act}));
        return ok(act);
    }

    private checkIgnored() {
        let out = [];
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
        r.error({
            message: `Engine error: ${err.message}`,
            toast: {
                title: "Engine error",
                description: (err.cause as Error)?.message,
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

export type ActError = Ignored | NoActions | ActionNotFound | EngineError;

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
