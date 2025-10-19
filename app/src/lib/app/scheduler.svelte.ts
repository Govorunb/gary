import type { Session } from "./session.svelte";
import type { Registry } from "$lib/api/registry.svelte";
import { toast } from "svelte-sonner";
import * as log from "@tauri-apps/plugin-log";
import { zAct, zActData } from "$lib/api/v1/spec";
import type { Engine } from "./engines";

export class Scheduler {
    muted: boolean = $state(false);
    sleeping: boolean = $state(false);
    private readonly registry: Registry;
    private activeEngine: Engine<any> | null;

    private get can_act() {
        return !this.muted && !this.sleeping;
    }

    constructor(private readonly session: Session) {
        this.registry = this.session.registry;
        this.activeEngine = $derived(this.session.activeEngine);
    }

    async try_act() {
        let ignoredReason = null;
        if (!this.can_act) {
            ignoredReason = `can_act: ${this.can_act}`;
        } else if (!this.activeEngine) {
            ignoredReason = `no loaded engine`;
        }
        if (ignoredReason) {
            log.debug(`Scheduler.try_act ignored - ${ignoredReason}`);
            return;
        }

        const actions = this.registry.games.flatMap(g => Array.from(g.actions.values()));
        if (actions.length === 0) {
            return;
        }
        const act = await this.activeEngine!.try_act(this.session, actions);
        if (!act) {
            log.debug(`Scheduler.try_act: engine chose not to act`);
            return;
        }
        const game = this.registry.games.find(g => g.actions.has(act.name));
        if (game) {
            log.info(`Engine acting: ${act.name}`);
            const actData = zActData.parse({...act});
            await game.conn.send(zAct.parse({data: actData}));
        } else {
            toast.error("Engine tried to run action not in any game", {
                description: `Action: ${act.name}`,
            });
        }
    }

    async force_act() {
        let ignoredReason = null;
        if (!this.can_act) {
            ignoredReason = `can_act: ${this.can_act}`;
        } else if (!this.activeEngine) {
            ignoredReason = `no loaded engine`;
        }
        if (ignoredReason) {
            log.warn(`Scheduler.force_act ignored - ${ignoredReason}`);
            return;
        }

        const actions = this.registry.games.flatMap(g => Array.from(g.actions.values()));
        if (actions.length === 0) {
            log.info("Scheduler.force_act: no actions registered");
            return;
        }
        const act = await this.activeEngine!.force_act(this.session, actions, "", "");
        if (!act) {
            log.error(`Scheduler.force_act: engine chose not to act (should not be possible!)`);
            return;
        }
        const game = this.registry.games.find(g => g.actions.has(act.name));
        if (game) {
            log.info(`Engine acting (forced): ${act.name}`);
            await game.conn.send(zAct.parse({data: act}));
        } else {
            toast.error("Engine tried to run unregistered action", {
                description: `Action: ${act.name}`,
            });
        }
    }
}
