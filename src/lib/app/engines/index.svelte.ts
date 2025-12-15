import { zActData, type Action } from "$lib/api/v1/spec";
import type z from "zod";
import type { Session } from "../session.svelte";
import type { UserPrefs } from "../prefs.svelte";
import type { ResultAsync } from "neverthrow";

export const zEngineAct = zActData.omit({ id: true });
export type EngineAct = z.infer<typeof zEngineAct>;

export abstract class Engine<TOptions> {
    abstract readonly name: string;
    readonly options: TOptions;
    readonly id: string;

    constructor(public userPrefs: UserPrefs, engineId: string) {
        this.id = engineId;
        this.options = $derived(userPrefs.engines[engineId] as TOptions);
    }
    
    abstract tryAct(session: Session, actions?: Action[]): ResultAsync<EngineAct | null, EngineError>;
    abstract forceAct(session: Session, actions?: Action[]): ResultAsync<EngineAct, EngineError>;

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
