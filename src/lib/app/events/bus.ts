import { v4 as uuid } from "uuid";
import type { EventByKey, EventData, EventInstance, EventKey } from ".";
import { DefaultMap } from "../utils";

export class EventBus {
    #allSubs: Set<EventSub<EventKey>> = new Set();
    #subs: DefaultMap<EventKey, Set<EventSub<any>>> = new DefaultMap(() => new Set());

    send<K extends EventKey>(key: K, data: EventData<K>) {
        const e = {
            id: uuid(),
            timestamp: Date.now(),
            key,
            data
        } as const satisfies EventInstance<K>;
        this.#allSubs.forEach(sub => sub.next(e));
        this.#subs.get(key).forEach(sub => sub.next(e));
    }

    subscribe(keys: []): EventSub<EventKey>;
    subscribe<Ks extends readonly EventKey[]>(keys: Ks): EventSub<Ks[number]>;
    subscribe<Ks extends readonly EventKey[]>(keys: Ks) {
        if (keys.length === 0) {
            const sub = new EventSub(() => this.#unsub(sub, keys));
            this.#allSubs.add(sub);
            return sub;
        }
        const sub = new EventSub<Ks[number]>(() => this.#unsub(sub, keys));
        for (const key of keys) {
            this.#subs.get(key).add(sub);
        }
        return sub;
    }

    #unsub(sub: EventSub<any>, keys: readonly EventKey[]) {
        sub.callback = null;
        if (keys.length === 0) {
            this.#allSubs.delete(sub);
        } else {
            keys.forEach(k => this.#subs.get(k).delete(sub));
        }
    }
}

export class EventSub<K extends EventKey> {
    callback: ((e: EventInstance<K>) => void) | null = null;

    constructor(public readonly unsubscribe: () => void) { }

    async* listen(): AsyncGenerator<EventByKey<K>> {

    }

    next(e: EventInstance<K>) {
        this.callback?.(e);
    }
}

export const BUS = new EventBus();
