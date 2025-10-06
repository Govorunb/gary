export abstract class ContextManager<TMessage extends Message> {
    readonly messages: TMessage[] = [];

    addSystem(text: string, silent: boolean) {
        this.add({
            source: { type: "system" },
            text,
            options: { silent }
        })
    }

    addGame(game: string, text: string, silent: boolean) {
        this.add({
            source: { type: "client", name: game },
            text,
            options: { silent }
        })
    }

    addUser(text: string, silent: boolean) {
        this.add({
            source: { type: "human" },
            text,
            options: { silent }
        })
    }

    add({...partialMsg}: Partial<Message> & Required<Pick<Message, "text" | "source">>) {
        const msg: Message = {
            timestamp: new Date(),
            options: { silent: false },
            ...partialMsg
        };
        this.messages.push(this.transform(msg));
    }

    /** Enrich the base message with any custom data before it is stored in the context. */
    protected abstract transform(message: Message): TMessage;
}

export class DefaultContextManager extends ContextManager<Message> {
    transform(message: Message): Message {
        return message;
    }
}

export type Message = {
    timestamp: Date;
    source: Source; // aka "role"
    text: string;
    options: MessageOptions;
}

export type MessageOptions = {
    silent: boolean;
}

export type Source = AppSource | ClientSource | ActorSource | UserSource;

/** Messages coming internally from the app (this one, with the server, not a client/game).
 * Example: game connect/disconnect messages.
*/
export type AppSource = {
    type: "system";
}

/** Messages coming from a connected WebSocket client, e.g. a game. */
export type ClientSource = {
    type: "client";
    name: string;
}

/** Messages from an "actor" (primarily an LLM). */
export type ActorSource = {
    type: "actor";
}

/** Messages manually inserted into the context by the user (human) through the web UI. */
export type UserSource = {
    type: "human";
}
