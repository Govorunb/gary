import { v7 as uuid7 } from "uuid";
import type { Session } from "./session.svelte";
import { z } from "zod";
import { zConst } from "$lib/app/utils";
import type { Game } from "$lib/api/registry.svelte";

export const DEFAULT_SYSTEM_PROMPT = `\
You are an expert gamer AI integrated into a special software system. Your main purpose is playing games, performing in-game actions via outputting JSON function calls.
You are goal-oriented and curious. You should aim to keep your actions varied and entertaining.

## Name

Assume your name is Gary unless the user refers to you otherwise. You may also expect to be called "Neuro" ("Neuro-sama", "Samantha") or "Evil" ("Evil Neuro", "Evilyn") by games.

## Response Format

Your output should be a JSON object with a "command" field.
Example action call: \`{"command":{"action":"open_door","data":{"door_number":1}}}\`
Don't output any other text.

## Communication

Based on configuration, you may have the ability to communicate with the user running your software or think out loud.
Example speech output: \`{"command":{"say":"Hello!","notify":false}}\`
Remember that your only means of interacting with the game is through actions. In-game characters cannot hear you speak unless there is a specific action for it.\
`;

export class ContextManager {
    readonly allMessages: Message[] = $state([]);
    /** A subset of messages that are visible to the model. */
    readonly actorView: Message[] = $derived(this.allMessages.filter(m => m.visibilityOverrides?.engine ?? true));
    /** A subset of messages that are visible to the user. */
    readonly userView: Message[] = $derived(this.allMessages.filter(m => m.visibilityOverrides?.user ?? true));

    constructor(public readonly session: Session) {
        this.reset();
    }

    push(msg: z.input<typeof zMessage>) {
        this.allMessages.push(zMessage.decode(msg));
    }

    pop() {
        return this.allMessages.pop();
    }

    protected clear() {
        this.allMessages.length = 0;
    }

    reset() {
        this.clear();
        const sys_prompt = this.session.userPrefs.app.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
        this.system({ text: sys_prompt, silent: true, customData: {} });
    }

    system(partialMsg: SourcelessMessageInput) {
        this.push({ source: zSystemSource.decode({}), ...partialMsg });
    }

    client(game: Game, partialMsg: SourcelessMessageInput) {
        this.push({ source: zClientSource.decode({name: game.name, id: game.conn.id}), ...partialMsg });
    }

    user(partialMsg: SourcelessMessageInput) {
        this.push({ source: zUserSource.decode({}), ...partialMsg });
    }

    actor(partialMsg: SourcelessMessageInput, manual: boolean = false) {
        this.push({ source: zActorSource.decode({manual}), silent: true, ...partialMsg });
    }
}

export const zSystemSource = z.strictObject({type: zConst("system")});
export const zClientSource = z.strictObject({type: zConst("client"), name: z.string(), id: z.string()});
export const zActorSource = z.strictObject({type: zConst("actor"), manual: z.boolean().default(false)});
export const zUserSource = z.strictObject({type: zConst("user")});

export const zSource = z.discriminatedUnion("type", [
    zSystemSource.required({type: true}),
    zClientSource.required({type: true}),
    zActorSource.required({type: true}),
    zUserSource.required({type: true}),
]);

export const zMessage = z.strictObject({
    id: z.string().default(uuid7),
    timestamp: z.coerce.date().default(() => new Date()),
    // TODO: maybe a "category"/"type" and this can just be an event stream for the entire app/session
    // would replace per-message visibility with per-category (making it configurable)
    // though context *should* ideally be separate
    source: zSource, // aka "role"
    text: z.string(),
    /** Non-silent messages will prompt the engine to act. Defaults to false. */
    silent: z.boolean().default(false), // FIXME: makes no sense for actor messages
    visibilityOverrides: z.strictObject({
        user: z.boolean().default(true),
        engine: z.boolean().default(true),
    }).optional().prefault({}),
    /** The convention for storing data is to key it by the ID of the engine, e.g.:
     * ```json
     * { "openRouter":{"requestInfo":{"id": ...,"usage":{ ... }} }
     * ```
    */
    customData: z.record(z.string(), z.any()).default({}),
});

export const zSourcelessMessage = zMessage.omit({source: true});
export type SourcelessMessageInput = z.input<typeof zSourcelessMessage>;

export type Message = z.infer<typeof zMessage>;
export type MessageSource = z.infer<typeof zSource>;
