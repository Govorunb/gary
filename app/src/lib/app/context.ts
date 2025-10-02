export class Context {
    readonly messages: Message[] = [];
}

export type Message = {
    timestamp: number;
    source: Source; // aka "role"
    text: string;
    options: {
        silent: boolean;
    };
}

export type Source = AppSource | ClientSource | ActorSource | UserSource;

/** Messages coming internally from the app (i.e. server).
 * Example: system prompt.
*/
export type AppSource = {
    type: "app";
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
    type: "user";
}
