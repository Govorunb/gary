import { DisplayHistory } from "./utils/display-history.svelte";
import type { EventInstance } from "./events";
import type { EventLogStore } from "./events/log.svelte";

export const USER_CONTEXT_KEYS = [
    "api/game/connected",
    "api/game/disconnected",
    "api/game/context",
    "api/game/force",
    "api/game/action_result",
    "api/game/act/user",
    "api/actor/skip",
    "api/actor/say",
    "api/actor/act",
    "ui/context/input",
] as const;

export const ACTOR_CONTEXT_KEYS = [
    "api/game/connected",
    "api/game/disconnected",
    "api/game/context",
    "api/game/force",
    "api/game/action_result",
    "api/game/act/user",
    "api/game/act/actor",
    "api/actor/generated",
    "api/actor/tool_error",
    "ui/context/input",
] as const;

/** Every event the context views are built from. */
export const CONTEXT_KEYS = [...new Set([
    ...USER_CONTEXT_KEYS,
    ...ACTOR_CONTEXT_KEYS,
    "ui/context/reset",
    "app/engines/llm/context_trimmed",
] as const)];

export type UserContextEventKey = typeof USER_CONTEXT_KEYS[number];
export type ActorContextEventKey = typeof ACTOR_CONTEXT_KEYS[number];

export type UserContextEvent = EventInstance<UserContextEventKey>;
export type ActorContextEvent = EventInstance<ActorContextEventKey>;

export const MAX_USER_CONTEXT_EVENTS = 1_000;
export const MAX_ACTOR_CONTEXT_EVENTS = 10_000;

export class ContextManager {
    #userView = new DisplayHistory<UserContextEvent>(MAX_USER_CONTEXT_EVENTS);
    readonly actorView: ActorContextEvent[] = [];
    #toolCalls = new Set<string>();

    #ondispose: (() => void)[] = [];
    #onActorEvent: Array<(event: ActorContextEvent, shouldPromptAct: boolean) => void> = [];

    constructor(eventLog: EventLogStore) {
        this.#ondispose.push(eventLog.subscribe(USER_CONTEXT_KEYS, ({ event }) => this.#userView.append(event)));
        this.#ondispose.push(eventLog.subscribe(ACTOR_CONTEXT_KEYS, ({ event }) => this.#appendActor(event)));
        this.#ondispose.push(eventLog.subscribe(["ui/context/reset"], () => this.#resetViews()));
        this.#ondispose.push(eventLog.subscribe(["app/engines/llm/context_trimmed"], ({ event }) => {
            this.#trimActorBefore(event.data.before);
        }));
    }

    get userView() {
        return this.#userView.items;
    }

    whenDisplayed() {
        return this.#userView.whenPublished();
    }

    /** Release a compacted prefix and any tool results whose calls were in that prefix. */
    #trimActorBefore(eventId: string) {
        const index = this.actorView.findIndex(event => event.id === eventId);
        if (index > 0) this.#trimActor(index);
    }

    #trimActor(count: number) {
        const retained = this.actorView.slice(count);
        this.#toolCalls.clear();
        for (const event of retained) {
            if (event.key === "api/actor/generated" && event.data.toolCall) {
                this.#toolCalls.add(event.data.toolCall.id);
            }
        }
        this.actorView.splice(0, this.actorView.length, ...retained.filter(event =>
            event.key !== "api/game/act/actor" || !event.data.toolCallId || this.#toolCalls.has(event.data.toolCallId)
        ));
    }

    onActorViewAppend(cb: (event: ActorContextEvent, shouldPromptAct: boolean) => void): () => void {
        this.#onActorEvent.push(cb);
        return () => {
            const i = this.#onActorEvent.indexOf(cb);
            if (i >= 0) {
                this.#onActorEvent.splice(i, 1);
            }
        };
    }

    #resetViews() {
        this.#userView.clear();
        this.actorView.length = 0;
        this.#toolCalls.clear();
    }

    dispose() {
        this.#userView.dispose();
        this.#ondispose.forEach(dispose => dispose());
        this.#ondispose.length = 0;
        this.#onActorEvent.length = 0;
    }

    #appendActor(event: ActorContextEvent) {
        if (event.key === "api/game/act/actor" && event.data.toolCallId && !this.#toolCalls.has(event.data.toolCallId)) return;
        if (event.key === "api/actor/generated" && event.data.toolCall) this.#toolCalls.add(event.data.toolCall.id);
        this.actorView.push(event);
        if (this.actorView.length > MAX_ACTOR_CONTEXT_EVENTS) {
            // Leave headroom so paused sessions do not copy the whole buffer on every event.
            this.#trimActor(Math.ceil(MAX_ACTOR_CONTEXT_EVENTS / 5));
        }
        const shouldPrompt = shouldPromptAct(event);
        this.#onActorEvent.forEach(cb => cb(event, shouldPrompt));
    }
}

function shouldPromptAct(event: ActorContextEvent): boolean {
    switch (event.key) {
        case "ui/context/input":
        case "api/game/context":
            return !event.data.silent;
        case "api/game/action_result":
            return !event.data.success;
        default:
            return false;
    }
}
