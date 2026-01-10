import { zActData, type Action } from "$lib/api/v1/spec";
import type { Session } from "../session.svelte";
import type { UserPrefs } from "../prefs.svelte";
import type { ResultAsync } from "neverthrow";
import z from "zod";
import { zConst } from "../utils";

export const zEngineAct = zActData.omit({ id: true });
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

export abstract class Engine<TOptions> {
    abstract readonly name: string;
    readonly id: string;

    get options() {
        return this.userPrefs.engines[this.id] as TOptions;
    }

    constructor(public userPrefs: UserPrefs, engineId: string) {
        this.id = engineId;
    }
    
    abstract tryAct(session: Session, actions?: Action[], signal?: AbortSignal): ResultAsync<EngineActResult, EngineActError>;
    abstract forceAct(session: Session, actions?: Action[], signal?: AbortSignal): ResultAsync<EngineAct, EngineActError>;

    protected resolveActions(session: Session, actions?: Action[]): Action[] {
        if (actions?.length) {
            return actions;
        }
        return session.registry.games.flatMap(g => g.getActiveActions());
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
