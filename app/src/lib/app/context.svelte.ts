import { v7 as uuid7 } from "uuid";
import type { Session } from "./session.svelte";
import { z } from "zod";
import { zConst } from "$lib/app/utils.svelte";

export abstract class ContextManager {
    readonly allMessages: Message[] = $state([]);
    /** A subset of messages that are visible to the model. */
    readonly actorView: Message[] = $derived(this.allMessages.filter(m => m.options.visibilityOverrides?.engine ?? true));
    /** A subset of messages that are visible to the user. */
    readonly userView: Message[] = $derived(this.allMessages.filter(m => m.options.visibilityOverrides?.user ?? true));

    constructor(private readonly session: Session) {
        
    }

    system(partialMsg: SourcelessMessage) {
        this.push({ source: { type: "system" }, ...partialMsg });
    }
    
    client(name: string, partialMsg: SourcelessMessage) {
        this.push({ source: { type: "client", name }, ...partialMsg });
    }

    user(partialMsg: SourcelessMessage) {
        this.push({ source: { type: "user" }, ...partialMsg });
    }

    actor(partialMsg: SourcelessMessage, manual: boolean = false) {
        this.push({ source: { type: "actor", manual }, ...partialMsg });
    }

    push(msg: z.input<typeof zMessage>) {
        this.allMessages.push(zMessage.decode(msg));
    }

    pop() {
        return this.allMessages.pop();
    }

    clear() {
        this.allMessages.length = 0;
    }
}

export class DefaultContextManager extends ContextManager {}


export const zSystemSource = z.strictObject({
    type: zConst("system"),
});

export const zClientSource = z.strictObject({
    type: zConst("client"),
    name: z.string(),
});

export const zActorSource = z.strictObject({
    type: zConst("actor"),
    /** Whether the action was manually triggered by the user through the app UI. */
    manual: z.boolean().default(false),
});

export const zUserSource = z.strictObject({
    type: zConst("user"),
});

export const zSource = z.discriminatedUnion("type", [
    zSystemSource.required({type: true}),
    zClientSource.required({type: true}),
    zActorSource.required({type: true}),
    zUserSource.required({type: true}),
]);

export const zMessageOptions = z.strictObject({
    /** Non-silent messages will prompt the engine to act. Defaults to false. */
    silent: z.boolean().default(false), // FIXME: makes no sense for actor messages
    visibilityOverrides: z.strictObject({
        user: z.boolean().default(true),
        engine: z.boolean().default(true),
    }).optional().prefault({}),
});

export const zMessage = z.strictObject({
    id: z.string().default(uuid7),
    timestamp: z.coerce.date().default(() => new Date()),
    // TODO: maybe a "category"/"type" and this can just be an event stream for the entire app/session
    // would replace per-message visibility with per-category (making it configurable)
    source: zSource, // aka "role"
    text: z.string(),
    options: zMessageOptions.prefault({}),
    /** The convention for storing data is to key it by the name of the engine, e.g.:
     * ```json
     * { "OpenRouter":{"requestInfo":{"id": ...,"usage":{ ... }} }
     * ```
    */
    customData: z.record(z.string(), z.any()).optional(),
});

export const zSourcelessMessage = zMessage.omit({source: true});
export type SourcelessMessage = z.input<typeof zSourcelessMessage>;

export type Message = z.infer<typeof zMessage>;
export type MessageOptions = z.infer<typeof zMessageOptions>;
export type MessageSource = z.infer<typeof zSource>;
