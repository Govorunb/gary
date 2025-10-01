// alternatively: ClientCommand and ServerCommand

export type GameCommand = |
    "startup"
    | "context"
    | "actions/register"
    | "actions/unregister"
    | "actions/force"
    | "action/result"
    | "shutdown/ready";

export type NeuroCommand = |
    "action"
    | "actions/reregister_all"
    | "shutdown/graceful"
    | "shutdown/immediate";

export type Action = {
    name: string;
    description?: string;
    schema: object; // TODO: package to deal with json schemas
}

export interface Message {
    readonly command: GameCommand | NeuroCommand;
}

// TODO: classes aren't doing type inference
export abstract class GameMessage implements Message {
    abstract readonly command: GameCommand;

    constructor(readonly game: string) { }
}

export abstract class NeuroMessage implements Message {
    abstract readonly command: NeuroCommand;
}

export class Startup extends GameMessage {
    readonly command = "startup";

    constructor(game: string) {
        super(game);
    }
}

export class Context extends GameMessage {
    readonly command = "context";
    data: {
        message: string;
        silent: boolean;
    }

    constructor(game: string, data: Context["data"]) {
        super(game);
        this.data = data;
    }
}

export type DataOf<T extends { data: unknown }> = T["data"];

export class RegisterActions extends GameMessage {
    readonly command = "actions/register";
    data: {
        actions: Action[];
    }

    constructor(game: string, data: DataOf<RegisterActions>) {
        super(game);
        this.data = data;
    }
}

export class UnregisterActions extends GameMessage {
    readonly command = "actions/unregister";
    data: {
        actionNames: string[];
    }

    constructor(game: string, data: DataOf<UnregisterActions>) {
        super(game);
        this.data = data;
    }
}

export class ForceAction extends GameMessage {
    readonly command = "actions/force";
    data: {
        state?: string;
        query: string;
        ephemeral_context?: boolean;
        action_names: string[];
    }

    constructor(game: string, data: DataOf<ForceAction>) {
        super(game);
        this.data = data;
    }
}

export class ActionResult extends GameMessage {
    readonly command = "action/result";
    data: {
        id: string;
        success: boolean;
        message?: string;
    }

    constructor(game: string, data: DataOf<ActionResult>) {
        super(game);
        this.data = data;
    }
}

// Neuro messages

export class ActionMessage extends NeuroMessage {
    readonly command = "action";
    data: {
        id?: string;
        name: string;
        data?: string | null;
    }

    constructor(data: DataOf<ActionMessage>) {
        super();
        this.data = data;
    }
}

export class ReregisterAll extends NeuroMessage {
    readonly command = "actions/reregister_all";
}

export class GracefulShutdown extends NeuroMessage {
    readonly command = "shutdown/graceful";
    data: {
        wants_shutdown: boolean;
    }
    constructor(data: DataOf<GracefulShutdown>) {
        super();
        this.data = data;
    }
}

export class ImmediateShutdown extends NeuroMessage {
    readonly command = "shutdown/immediate";
}

export class ShutdownReady extends GameMessage {
    readonly command = "shutdown/ready";
}
