import { v7 as uuid7 } from "uuid";
import type { Session } from "./session.svelte";
import { z } from "zod";
import { zConst } from "$lib/app/utils";
import type { Game } from "$lib/api/registry.svelte";

export abstract class ContextManager {
    readonly allMessages: Message[] = $state([]);
    /** A subset of messages that are visible to the model. */
    readonly actorView: Message[] = $derived(this.allMessages.filter(m => m.visibilityOverrides?.engine ?? true));
    /** A subset of messages that are visible to the user. */
    readonly userView: Message[] = $derived(this.allMessages.filter(m => m.visibilityOverrides?.user ?? true));

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

export class DefaultContextManager extends ContextManager {

    constructor(public readonly session: Session) {
        super();
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
