import { v7 as uuid7 } from "uuid";
import { z } from "zod";
import { zConst } from "$lib/app/utils";
import type { Game } from "$lib/api/game.svelte";

export class ContextManager {
    readonly allMessages: Message[] = $state([]);
    /** A subset of messages that are visible to the model. */
    readonly actorView: Message[] = $derived(this.allMessages.filter(m => m.visibilityOverrides?.engine ?? true));
    /** A subset of messages that are visible to the user. */
    readonly userView: Message[] = $derived(this.allMessages.filter(m => m.visibilityOverrides?.user ?? true));

    constructor() {
        this.reset();
    }

    push(msg: z.input<typeof zMessage>): z.output<typeof zMessage> {
        const msg_ = zMessage.decode(msg);
        this.allMessages.push(msg_);
        return msg_;
    }

    pop() {
        return this.allMessages.pop();
    }

    protected clear() {
        this.allMessages.length = 0;
    }

    reset() {
        this.clear();
    }

    system(partialMsg: SourcelessMessageInput) {
        return this.push({ source: zSystemSource.decode({}), ...partialMsg });
    }

    client(game: Game, partialMsg: SourcelessMessageInput) {
        return this.push({ source: zClientSource.decode({name: game.name, id: game.conn.id}), ...partialMsg });
    }

    user(partialMsg: SourcelessMessageInput) {
        return this.push({ source: zUserSource.decode({}), ...partialMsg });
    }

    actor(partialMsg: SourcelessMessageInput, engineId: string) {
        return this.push({ source: zActorSource.decode({engineId}), silent: true, ...partialMsg });
    }
}

export const zSystemSource = z.strictObject({type: zConst("system")});
export const zClientSource = z.strictObject({type: zConst("client"), name: z.string(), id: z.string()});
export const zActorSource = z.strictObject({type: zConst("actor"), engineId: z.string()});
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
    /** If `true`, the message will show de-emphasized in the UI.
     *
     * `false` will prompt the scheduler to act, `true` and `"noAct"` won't.

     * Defaults to `false`.
     *
     * ---
     * Actor messages don't prompt acting even if non-silent.
     */
    silent: z.union([z.boolean(), z.literal("noAct")]).default(false),
    visibilityOverrides: z.strictObject({
        user: z.boolean().default(true),
        engine: z.boolean().default(true),
    }).optional().prefault({}),
    customData: z.record(z.string(), z.any()).default({}),
});

export const zSourcelessMessage = zMessage.omit({source: true});
export type SourcelessMessageInput = z.input<typeof zSourcelessMessage>;

export type Message = z.infer<typeof zMessage>;
export type MessageSource = z.infer<typeof zSource>;
