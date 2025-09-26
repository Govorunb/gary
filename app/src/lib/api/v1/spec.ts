// alternatively: ClientCommand and ServerCommand
type GameCommand = |
    "startup"
    | "context"
    | "actions/register"
    | "actions/unregister"
    | "actions/force"
    | "action/result"
    | "shutdown/ready";

type NeuroCommand = |
    "action"
    | "actions/reregister_all"
    | "shutdown/graceful"
    | "shutdown/immediate";

type Action = {
    name: string;
    description?: string;
    schema: object; // TODO: package to deal with json schemas
}

interface Message {
    readonly command: GameCommand | NeuroCommand;
}

abstract class GameMessage implements Message {
    abstract readonly command: GameCommand;

    constructor(readonly game: string) { }
}

abstract class NeuroMessage implements Message {
    abstract readonly command: NeuroCommand;
}

class Startup extends GameMessage {
    readonly command = "startup";

    constructor(game: string) {
        super(game);
    }
}

class Context extends GameMessage {
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

type DataOf<T extends { data: unknown }> = T["data"];

class RegisterActions extends GameMessage {
    readonly command = "actions/register";
    data: {
        actions: Action[];
    }

    constructor(game: string, data: DataOf<RegisterActions>) {
        super(game);
        this.data = data;
    }
}

class UnregisterActions extends GameMessage {
    readonly command = "actions/unregister";
    data: {
        actionNames: string[];
    }

    constructor(game: string, data: DataOf<UnregisterActions>) {
        super(game);
        this.data = data;
    }
}

class ForceAction extends GameMessage {
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

class ActionResult extends GameMessage {
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

class ActionMessage extends NeuroMessage {
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

class ReregisterAll extends NeuroMessage {
    readonly command = "actions/reregister_all";
}

class GracefulShutdown extends NeuroMessage {
    readonly command = "shutdown/graceful";
    data: {
        wants_shutdown: boolean;
    }
    constructor(data: DataOf<GracefulShutdown>) {
        super();
        this.data = data;
    }
}

class ImmediateShutdown extends NeuroMessage {
    readonly command = "shutdown/immediate";
}

class ShutdownReady extends GameMessage {
    readonly command = "shutdown/ready";
}
