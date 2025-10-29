import type { Session } from "./session.svelte";
import type { Registry } from "$lib/api/registry.svelte";
import { toast } from "svelte-sonner";
import * as log from "@tauri-apps/plugin-log";
import { zAct, zActData, type Action } from "$lib/api/v1/spec";
import type { Engine } from "./engines";

// TODO: pause on engine error (require user to acknowledge & manually resume)
export class Scheduler {
    /** Explicitly muted, e.g. through the app UI. */
    public muted = $state(false);
    /** Simulating a busy state, e.g. pretending to wait for TTS. */
    public sleeping = $state(false);
    /** Paused due to an engine error that requires user intervention. */
    public errored = $state(false);
    private readonly registry: Registry;
    private activeEngine: Engine<any> | null;
    public readonly canAct: boolean;
    public readonly activeMutes: string[];
    /** A signal telling the scheduler to prompt the active engine to act as soon as possible.
     * This can be flipped true by:
     * - Non-silent context messages
     * - Idle timers (TODO)
     * - Manual user actions
     * And it is flipped false when attempting to act.
     * Note: this means the act may fail, or the actor may choose not to act; this still consumes the pending signal.
     */
    public actPending = $state(false);

    constructor(private readonly session: Session) {
        this.registry = this.session.registry;
        this.activeEngine = $derived(this.session.activeEngine);
        this.canAct = $derived(!this.muted && !this.sleeping && !this.errored);
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
            log.debug(`Scheduler.tryAct ignored - ${ignores.join("; ")}`);
            return;
        }

        const actions = this.registry.games.flatMap(g => Array.from(g.actions.values()));
        if (actions.length === 0) {
            return;
        }
        // TODO: catch errors (neverthrow)
        const act = await this.activeEngine!.tryAct(this.session, actions);
        this.actPending = false;
        if (!act) {
            log.debug(`Scheduler.tryAct: engine chose not to act`);
            return;
        }
        const game = this.registry.games.find(g => g.actions.has(act.name));
        if (game) {
            log.info(`Engine acting: ${act.name}`);
            const actData = zActData.decode({...act});
            await game.conn.send(zAct.decode({data: actData}));
        } else {
            toast.error("Engine selected unknown action", {
                description: `Action: ${act.name}\nThis action was not registered by any game`,
            });
        }
    }

    async forceAct(actions?: Action[]) {
        const ignores = this.checkIgnored();
        if (ignores.length) {
            log.warn(`Scheduler.forceAct ignored - ${ignores.join("; ")}`);
            return;
        }
        
        const actionsProvided = actions !== undefined;
        actions ??= this.registry.games.flatMap(g => Array.from(g.actions.values()));
        if (actions.length === 0) {
            const logMethod = actionsProvided ? log.error : log.info;
            logMethod(`Scheduler.forceAct: no actions ${actionsProvided ? "provided" : "registered"}`);
            return;
        }
        // TODO: catch errors (neverthrow)
        const act = await this.activeEngine!.forceAct(this.session, actions);
        this.actPending = false;
        if (!act) {
            log.error(`Scheduler.forceAct: engine chose not to act (should not be possible!)`);
            return;
        }
        const game = this.registry.games.find(g => g.actions.has(act.name));
        if (game) {
            log.info(`Engine acting (forced): ${act.name}`);
            await game.conn.send(zAct.decode({data: act}));
        } else {
            toast.error("Engine selected unknown action", {
                description: `Action: ${act.name}\nThis action was not registered by any game`,
            });
        }
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

    private onError(err: string) {
        toast.error("Engine error", {
            description: err,
        });
        this.errored = true;
    }

    public clearError() {
        this.errored = false;
    }
}
