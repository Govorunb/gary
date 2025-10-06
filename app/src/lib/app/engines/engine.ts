import type { Act, Action } from "$lib/api/v1/spec";

// object representing force_act args
type ForceAct = {
    actions: Action[];
    query: string;
    state: string;
}

export abstract class Engine {
    abstract readonly name: string;
    abstract try_act(actions: Action[]): Promise<Act | null>;
    abstract force_act(actions: Action[], query: string, state: string): Promise<Act>;
    abstract context(message: string, silent: boolean): Promise<void>;
}