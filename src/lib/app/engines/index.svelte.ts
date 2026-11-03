import { zActData, type Action, type ForceAction } from "#lib/api/v1/spec.js";
import type { ContextManager } from "../context.svelte";
import { EVENT_BUS, type EventBus } from "../events/bus";
import type { UserPrefs } from "../prefs.svelte";
import type { ResultAsync } from "neverthrow";
import z from "zod";
import { zConst } from "../utils";

export const zEngineAct = zActData.omit({ id: true }).extend({
    toolCallId: z.string().optional(),
});
export const zSkip = zConst("skip");
export const zYap = z.strictObject({
    say: z.string(),
    notify: z.boolean().default(false),
})
export type EngineAct = z.infer<typeof zEngineAct>;
export type Skip = z.infer<typeof zSkip>;
export type Yap = z.infer<typeof zYap>;
export type EngineActError = EngineError | "cancelled";
export type EngineActResult = EngineAct | Skip | Yap;

/** The engine's view of a decision. It has no game transport or scheduler. */
export interface EngineContext {
    context: Pick<ContextManager, "actorView" | "trimActorBefore">;
    registry: { games: {
        id: string;
        name: string;
        shortId: string;
        actions: ReadonlyMap<string, Action & { active: boolean }>;
    }[] };
    userPrefs: { app: Pick<UserPrefs["app"], "systemPrompt"> };
    uiState: { aprilFools: boolean };
}

export type EnginePrefs = { engines: Record<string, unknown> };

export abstract class Engine<TOptions> {
    abstract readonly name: string;
    readonly id: string;

    get options() {
        return this.userPrefs.engines[this.id] as TOptions;
    }

    constructor(public userPrefs: EnginePrefs, engineId: string, protected readonly eventBus: EventBus = EVENT_BUS) {
        this.id = engineId;
    }

    abstract tryAct(session: EngineContext, actions?: Action[], signal?: AbortSignal): ResultAsync<EngineActResult, EngineActError>;
    abstract forceAct(session: EngineContext, actions?: Action[], signal?: AbortSignal, forceContext?: ForceAction["data"]): ResultAsync<EngineAct, EngineActError>;

    protected resolveActions(session: EngineContext, actions?: Action[]): Action[] {
        if (actions !== undefined) {
            return actions;
        }
        return session.registry.games.flatMap(g => Array.from(g.actions.values().filter(a => a.active)));
    }
}

// rough draft, TODO proper architecture
export class EngineError extends Error {
    constructor(message: string, cause?: Error,
        public readonly recoverable: boolean = true
    ) {
        super(message, { cause });
    }
}
