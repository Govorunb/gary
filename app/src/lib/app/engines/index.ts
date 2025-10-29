import { zActData, type Action } from "$lib/api/v1/spec";
import type z from "zod";
import type { Session } from "../session.svelte";
import type { UserPrefs } from "../prefs.svelte";

export const zEngineAct = zActData.omit({ id: true });
export type EngineAct = z.infer<typeof zEngineAct>;

export abstract class Engine<TOptions> {
    abstract readonly name: string;
    readonly options: TOptions;

    constructor(public userPrefs: UserPrefs, engineId: string) {
        this.options = $derived(userPrefs.engines[engineId]);
    }
    
    abstract tryAct(session: Session, actions: Action[]): Promise<EngineAct | null>;
    abstract forceAct(session: Session, actions: Action[], query: string, state: string): Promise<EngineAct>;
}