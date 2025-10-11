import { v4 as uuidv4 } from "uuid";
import { DefaultContextManager } from "./context.svelte";

export class Session {
    readonly id: string;
    readonly context: DefaultContextManager;
    name: string;

    constructor(name: string) {
        this.id = uuidv4();
        this.name = $state(name);
        this.context = new DefaultContextManager();
    }
}