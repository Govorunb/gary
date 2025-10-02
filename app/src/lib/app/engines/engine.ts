import type { Act, Action } from "$lib/api/v1/spec";

export abstract class Engine {
    abstract readonly name: string;
    abstract try_act(actions: Action[]): Promise<Act | null>;
    abstract force_act(actions: Action[], query: string, state: string): Promise<Act>;
    abstract context(message: string, silent: boolean): Promise<void>;
}