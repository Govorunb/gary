import type { EventInstance, EventKey } from ".";
import { EVENT_BUS, type EventBus } from "./bus";

export type EventLogDelta =
    | { type: "append"; event: EventInstance<EventKey> }
    | { type: "reset" };

type Unsub = () => void;

export class EventLogStore {
    readonly all: EventInstance<EventKey>[] = $state([]);
    #subs: Array<(delta: EventLogDelta) => void> = [];
    #subsByKey = new Map<EventKey, Array<(delta: EventLogDelta) => void>>();
    #busSub;

    constructor(private readonly bus: EventBus = EVENT_BUS) {
        this.#busSub = this.bus.subscribe();
        this.#busSub.onnext((event) => this.append(event));
    }

    append(event: EventInstance<EventKey>) {
        this.all.push(event);
        this.#emit({ type: "append", event });
    }

    clear() {
        this.all.length = 0;
        this.#emit({ type: "reset" });
    }

    subscribe(cb: (delta: EventLogDelta) => void): Unsub;
    subscribe<Ks extends readonly EventKey[]>(keys: Ks, cb: (delta: EventLogDelta) => void): Unsub;
    subscribe<Ks extends readonly EventKey[]>(
        keysOrCb: Ks | ((delta: EventLogDelta) => void),
        cbMaybe?: (delta: EventLogDelta) => void,
    ): Unsub {
        if (typeof keysOrCb === "function") {
            const cb = keysOrCb;
            this.#subs.push(cb);
            return () => {
                const i = this.#subs.indexOf(cb);
                if (i >= 0) {
                    this.#subs.splice(i, 1);
                }
            };
        }

        const keys = keysOrCb;
        const cb = cbMaybe!;
        for (const key of keys) {
            let cbs = this.#subsByKey.get(key);
            if (!cbs) {
                cbs = [];
                this.#subsByKey.set(key, cbs);
            }
            cbs.push(cb);
        }
        return () => {
            for (const key of keys) {
                const cbs = this.#subsByKey.get(key);
                if (!cbs) continue;
                const i = cbs.indexOf(cb);
                if (i >= 0) {
                    cbs.splice(i, 1);
                }
            }
        };
    }

    dispose() {
        this.#busSub.destroy();
        this.#subs.length = 0;
        this.#subsByKey.clear();
    }

    #emit(delta: EventLogDelta) {
        this.#subs.forEach((cb) => cb(delta));

        if (delta.type === "append") {
            const cbs = this.#subsByKey.get(delta.event.key);
            cbs?.forEach((cb) => cb(delta));
            return;
        }

        const onreset = new Set<(delta: EventLogDelta) => void>();
        this.#subsByKey.forEach((cbs) => cbs.forEach((cb) => onreset.add(cb)));
        onreset.forEach((cb) => cb(delta));
    }
}
