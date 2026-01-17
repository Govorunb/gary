import { v4 as uuid } from "uuid";
import type { EventData, EventDef, EventInstance, EventKey, DatalessKey, HasDataKey } from ".";
import { createListener, DefaultMap } from "../utils";

export class EventBus {
    #allSubs: Set<EventSub<EventKey>> = new Set();
    #subs: DefaultMap<EventKey, Set<EventSub<any>>> = new DefaultMap(() => new Set());

    send<K extends DatalessKey>(key: K): void;
    send<K extends HasDataKey>(key: K, data: EventData<K>): void;
    send<K extends EventKey>(key: K, data?: EventData<K>) {
        const e = {
            id: uuid(),
            timestamp: Date.now(),
            key,
            data
        } as EventInstance<K>; // can't `satisfies` :(
        this.#allSubs.forEach(sub => sub.next(e));
        this.#subs.get(key).forEach(sub => sub.next(e));
    }

    subscribe(): EventSub<EventKey>;
    subscribe<Ks extends readonly EventKey[]>(keys: Ks): EventSub<Ks[number]>;
    subscribe<Ks extends readonly EventKey[]>(keys?: Ks) {
        if (keys === undefined) {
            const sub = new EventSub(() => this.#unsub(sub));
            this.#allSubs.add(sub);
            return sub;
        }
        const sub = new EventSub<Ks[number]>(() => this.#unsub(sub, keys));
        for (const key of keys) {
            this.#subs.get(key).add(sub);
        }
        return sub;
    }

    #unsub(sub: EventSub<any>, keys?: readonly EventKey[]) {
        if (keys === undefined) {
            this.#allSubs.delete(sub);
        } else {
            keys.forEach(k => this.#subs.get(k).delete(sub));
        }
    }
}

export class EventSub<K extends EventKey> {
    #onnext: ((e: EventInstance<K>) => void)[] = [];
    #ondestroy: (() => void)[];

    constructor(unsubscribe: () => void) {
        this.#ondestroy = [unsubscribe];
    }

    listen(): AsyncGenerator<EventInstance<K>> {
        return createListener((n, d) => {
            this.onnext(n);
            this.ondestroy(d);
        });
    }

    next(e: EventInstance<K>) {
        this.#onnext.forEach(cb => cb(e));
    }

    onnext(cb: (e: EventInstance<K>) => void) {
        this.#onnext.push(cb);
    }

    ondestroy(cb: () => void) {
        this.#ondestroy.push(cb);
    }

    destroy() {
        this.#onnext.length = 0;
        this.#ondestroy.forEach(cb => cb());
        this.#ondestroy.length = 0;
    }
}

export const BUS = new EventBus();

export const MY_EVENTS = [
    {
        key: 'thank_the_bus_driver',
    },
] as const satisfies EventDef[];

BUS.send("thank_the_bus_driver");
// BUS.send("thank_the_bus_driver", undefined);
// BUS.send("test1");
BUS.send("test1", null);
