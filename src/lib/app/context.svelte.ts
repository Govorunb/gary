import { z } from "zod";
import { zConst } from "$lib/app/utils";
import type { EventInstance, EventKey } from "./events";
import type { EventLogDelta, EventLogStore } from "./events/log.svelte";

export class ContextManager {
    #allMessages: Message[] = $state([]);
    public get allMessages() {
        return this.#allMessages;
    }
    /** A subset of messages that are visible to the model. */
    readonly actorView: Message[] = $derived(this.allMessages.filter(m => m.visibilityOverrides?.engine ?? true));
    /** A subset of messages that are visible to the user. */
    readonly userView: Message[] = $derived(this.allMessages.filter(m => m.visibilityOverrides?.user ?? true));
    #ondispose: (() => void)[] = [];
    #onActorMessage: ((msg: Message) => void)[] = [];

    constructor(private readonly eventLog: EventLogStore) {
        this.#ondispose.push(this.eventLog.onDelta(delta => this.#onDelta(delta)));
        this.eventLog.all.forEach(event => this.#appendProjected(event));
    }

    onActorViewAppend(cb: (msg: Message) => void): () => void {
        this.#onActorMessage.push(cb);
        return () => {
            const i = this.#onActorMessage.indexOf(cb);
            if (i >= 0) {
                this.#onActorMessage.splice(i, 1);
            }
        };
    }

    reset() {
        this.#allMessages.length = this.eventLog.all.length;
        // TODO: for when allMessages is an array of events
        // for (let i = 0; i < this.allMessages.length; i++) {
        //     this.#allMessages[i] = this.eventLog.all[i];
        // }
    }

    dispose() {
        this.#ondispose.forEach(dispose => dispose());
        this.#ondispose.length = 0;
        this.#onActorMessage.length = 0;
    }

    #onDelta(delta: EventLogDelta) {
        if (delta.type === "reset") {
            this.reset();
            return;
        }
        this.#appendProjected(delta.event);
    }

    #appendProjected(event: EventInstance<EventKey>) {
        const projection = projectEventForContext(event);
        if (!projection) return;
        const msg = zMessage.decode({
            id: event.id,
            timestamp: event.timestamp,
            source: projection.source,
            text: "",
            silent: projection.silent ?? false,
            visibilityOverrides: {
                user: projection.showUser,
                engine: projection.showActor,
            },
            customData: {
                event,
            },
        });
        this.allMessages.push(msg);
        if (msg.visibilityOverrides?.engine ?? true) {
            this.#onActorMessage.forEach(cb => cb(msg));
        }
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
    id: z.string(),
    timestamp: z.coerce.date().default(() => new Date()),
    source: zSource,
    text: z.string(),
    silent: z.union([z.boolean(), z.literal("noAct")]).default(false),
    visibilityOverrides: z.strictObject({
        user: z.boolean().default(true),
        engine: z.boolean().default(true),
    }).optional().prefault({}),
    customData: z.record(z.string(), z.any()).default({}),
});

export type Message = z.infer<typeof zMessage>;
export type MessageSource = z.infer<typeof zSource>;

export function getMessageEvent(msg: Message): EventInstance<EventKey> | null {
    const evt = msg.customData.event;
    if (!evt || typeof evt !== "object" || typeof evt.key !== "string") {
        return null;
    }
    return evt as EventInstance<EventKey>;
}

type ContextProjection = {
    source: MessageSource;
    silent?: Message["silent"];
    showUser: boolean;
    showActor: boolean;
};

function projectEventForContext(event: EventInstance<EventKey>): ContextProjection | null {
    switch (event.key) {
        case "api/game/connected":
        case "api/game/disconnected":
            return {
                source: zSystemSource.decode({}),
                silent: true,
                showUser: true,
                showActor: true,
            };
        case "api/game/context":
            return {
                source: zClientSource.decode({
                    id: event.data.game.id,
                    name: event.data.game.name,
                }),
                silent: event.data.silent,
                showUser: true,
                showActor: true,
            };
        case "api/game/force":
            return {
                source: zClientSource.decode({
                    id: event.data.game.id,
                    name: event.data.game.name,
                }),
                silent: "noAct",
                showUser: true,
                showActor: true,
            };
        case "api/game/action_result":
            return {
                source: zClientSource.decode({
                    id: event.data.game.id,
                    name: event.data.game.name,
                }),
                silent: event.data.success || "noAct",
                showUser: true,
                showActor: true,
            };
        case "api/game/act/user":
            return {
                source: zUserSource.decode({}),
                silent: true,
                showUser: true,
                showActor: true,
            };
        case "api/game/act/actor":
            return {
                source: zSystemSource.decode({}),
                silent: true,
                showUser: false,
                showActor: true,
            };
        case "api/actor/skip":
            return {
                source: zActorSource.decode({ engineId: event.data.engineId }),
                silent: true,
                showUser: true,
                showActor: false,
            };
        case "api/actor/say":
            return {
                source: zActorSource.decode({ engineId: event.data.engineId }),
                silent: !event.data.notify,
                showUser: true,
                showActor: false,
            };
        case "api/actor/act":
            return {
                source: zActorSource.decode({ engineId: event.data.engineId }),
                silent: false,
                showUser: true,
                showActor: false,
            };
        case "api/actor/generated":
            return {
                source: zActorSource.decode({ engineId: event.data.engineId }),
                silent: true,
                showUser: false,
                showActor: true,
            };
        case "ui/context/input":
            return {
                source: zUserSource.decode({}),
                silent: event.data.silent,
                showUser: true,
                showActor: true,
            };
        default:
            return null;
    }
}
