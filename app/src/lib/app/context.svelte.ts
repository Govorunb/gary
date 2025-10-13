import { v7 as uuid7 } from "uuid";

export abstract class ContextManager {
    readonly allMessages: Message[] = $state([]);
    /** A subset of messages that are visible to the model. */
    readonly modelView: Message[] = $derived(this.allMessages.filter(m => m.options.visibility?.model ?? true));
    /** A subset of messages that are visible to the user. */
    readonly userView: Message[] = $derived(this.allMessages.filter(m => m.options.visibility?.user ?? true));

    system(text: string, options: MessageOptions, data?: CustomData) {
        this.push({
            source: { type: "system" },
            text,
            options,
            customData: data,
        })
    }
    
    client(name: string, text: string, options: MessageOptions, data?: CustomData) {
        this.push({
            source: { type: "client", name },
            text,
            options,
            customData: data,
        })
    }

    user(text: string, options: MessageOptions, data?: CustomData) {
        this.push({
            source: { type: "user" },
            text,
            options,
            customData: data,
        })
    }

    actor(text: string, manual: boolean, options: MessageOptions, data?: CustomData) {
        this.push({
            source: { type: "actor", manual },
            text,
            options,
            customData: data,
        })
    }
    
    push({...partialMsg}: Partial<Message> & Required<Pick<Message, "text" | "source">>) {
        const msg: Message = {
            id: uuid7(),
            timestamp: new Date(),
            options: {
                silent: false,
                visibility: {
                    model: true,
                    user: true,
                }
            },
            ...partialMsg
        };
        this.allMessages.push(msg);
    }

    pop() {
        return this.allMessages.pop();
    }

    clear() {
        this.allMessages.length = 0;
    }
}

export class DefaultContextManager extends ContextManager {}

type CustomData = Record<string, any>;

export type Message = {
    id: string;
    timestamp: Date;
    source: Source; // aka "role"
    text: string;
    options: MessageOptions;
    /** The convention for storing data is to key it by the name of the engine, e.g.:
     * ```json
     * { "OpenRouter":{"requestInfo":{"id": ...,"usage":{ ... }} }
     * ```
    */
    customData?: CustomData;
}

export type MessageOptions = {
    /** Non-silent messages will prompt the model to act. Defaults to false. */
    silent?: boolean;
    /** Controls visibility of the message to the user and the model. */
    visibility?: {
        /** Defaults to true. */
        user?: boolean;
        /** Defaults to true. */
        model?: boolean;
    }
}

export type Source = SystemSource | ClientSource | ActorSource | UserSource;

/** Messages coming internally from the app (this one, with the server, not a client/game).
 * Example: game connect/disconnect messages.
*/
export type SystemSource = {
    type: "system";
}

/** Messages coming from a connected WebSocket client, e.g. a game. */
export type ClientSource = {
    type: "client";
    name: string;
}

/** Messages from an "actor" (Randy, an LLM, Tony (the user), etc.) */
export type ActorSource = {
    type: "actor";
    /** Whether the action was manually triggered by the user through the app UI. */
    manual: boolean;
}

/** Messages manually inserted into the context by the user (human) through the app UI. */
export type UserSource = {
    type: "user";
}
