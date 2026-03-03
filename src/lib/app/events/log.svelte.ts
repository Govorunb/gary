import type { EventInstance, EventKey } from ".";
import { EVENT_BUS, type EventBus } from "./bus";

export type EventLogDelta =
    | { type: "append"; event: EventInstance<EventKey> }
    // | { type: "insert"; at: number; event: EventInstance<EventKey> }
    // | { type: "remove"; at: number; event: EventInstance<EventKey> }
    | { type: "reset" };

export class EventLogStore {
    readonly all: EventInstance<EventKey>[] = $state([]);
    #ondelta: ((delta: EventLogDelta) => void)[] = [];
    #sub;

    constructor(private readonly bus: EventBus = EVENT_BUS) {
        this.#sub = this.bus.subscribe();
        this.#sub.onnext((event) => this.append(event));
    }

    append(event: EventInstance<EventKey>) {
        this.all.push(event);
        this.#emit({ type: "append", event });
    }

    clear() {
        this.all.length = 0;
        this.#emit({ type: "reset" });
    }

    onDelta(cb: (delta: EventLogDelta) => void): () => void {
        this.#ondelta.push(cb);
        return () => {
            const i = this.#ondelta.indexOf(cb);
            if (i >= 0) {
                this.#ondelta.splice(i, 1);
            }
        };
    }

    dispose() {
        this.#sub.destroy();
        this.#ondelta.length = 0;
    }

    #emit(delta: EventLogDelta) {
        this.#ondelta.forEach((cb) => cb(delta));
    }
}
