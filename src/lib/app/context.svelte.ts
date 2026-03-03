import type { EventInstance } from "./events";
import type { EventLogDelta, EventLogStore } from "./events/log.svelte";

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
    "ui/context/input",
] as const;

export type UserContextEventKey = typeof USER_CONTEXT_KEYS[number];
export type ActorContextEventKey = typeof ACTOR_CONTEXT_KEYS[number];

export type UserContextEvent = EventInstance<UserContextEventKey>;
export type ActorContextEvent = EventInstance<ActorContextEventKey>;

export class ContextManager {
    readonly userView: UserContextEvent[] = $state([]);
    readonly actorView: ActorContextEvent[] = $state([]);

    #ondispose: (() => void)[] = [];
    #onActorEvent: Array<(event: ActorContextEvent, shouldPromptAct: boolean) => void> = [];

    constructor(private readonly eventLog: EventLogStore) {
        this.#ondispose.push(this.eventLog.subscribe(USER_CONTEXT_KEYS, (delta) => this.#onUserDelta(delta)));
        this.#ondispose.push(this.eventLog.subscribe(ACTOR_CONTEXT_KEYS, (delta) => this.#onActorDelta(delta)));

        const userKeys = new Set<string>(USER_CONTEXT_KEYS);
        const actorKeys = new Set<string>(ACTOR_CONTEXT_KEYS);
        for (const event of this.eventLog.all) {
            if (userKeys.has(event.key)) {
                this.userView.push(event as UserContextEvent);
            }
            if (actorKeys.has(event.key)) {
                const actorEvent = event as ActorContextEvent;
                this.actorView.push(actorEvent);
            }
        }
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

    reset() {
        this.userView.length = 0;
        this.actorView.length = 0;
    }

    dispose() {
        this.#ondispose.forEach(dispose => dispose());
        this.#ondispose.length = 0;
        this.#onActorEvent.length = 0;
    }

    #onUserDelta(delta: EventLogDelta) {
        if (delta.type === "reset") {
            this.userView.length = 0;
            return;
        }
        this.userView.push(delta.event as UserContextEvent);
    }

    #onActorDelta(delta: EventLogDelta) {
        if (delta.type === "reset") {
            this.actorView.length = 0;
            return;
        }
        const event = delta.event as ActorContextEvent;
        this.actorView.push(event);
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
            return !!event.data.success;
        default:
            return false;
    }
}
