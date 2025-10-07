import { zActData, type Action } from "$lib/api/v1/spec";
import type z from "zod";
import { ContextManager, DefaultContextManager } from "../context.svelte";

export const zEngineAct = zActData.omit({id: true});
export type EngineAct = z.infer<typeof zEngineAct>;

export abstract class Engine<TOptions> {
    abstract readonly name: string;

    constructor(public options: TOptions, protected contextManager: ContextManager = new DefaultContextManager()) {
        if (contextManager.modelView.length > 0)
            contextManager.clear();
    }
    
    abstract try_act(actions: Action[]): Promise<EngineAct | null>;
    abstract force_act(actions: Action[], query: string, state: string): Promise<EngineAct>;
}