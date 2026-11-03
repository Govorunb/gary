import { DisplayHistory } from "../utils/display-history.svelte";
import type { EventInstance, EventKey } from ".";
import { EVENT_BUS, type EventBus } from "./bus";

export type EventLogDelta = { type: "append"; event: EventInstance<EventKey> };

type Unsub = () => void;

export const MAX_DISPLAYED_EVENTS = 1_000;

export type EventWait = {
    /** Events after the starting cursor, up to and including the match. */
    events: EventInstance<EventKey>[];
    matched?: EventInstance<EventKey>;
    /** Position right after the last collected event. */
    cursor: number;
};

export class EventLogStore {
    #displayed = new DisplayHistory<EventInstance<EventKey>>(MAX_DISPLAYED_EVENTS);
    #appended = 0;
    #subs: Array<(delta: EventLogDelta) => void> = [];
    #subsByKey = new Map<EventKey, Array<(delta: EventLogDelta) => void>>();
    #busSub;

    constructor(private readonly bus: EventBus = EVENT_BUS) {
        this.#busSub = this.bus.subscribe();
        this.#busSub.onnext((event) => this.append(event));
    }

    get displayed() {
        return this.#displayed.items;
    }

    /** Position after the newest event. Pass it to `since` or `waitFor` to see what comes next. */
    get cursor() {
        return this.#appended;
    }

    append(event: EventInstance<EventKey>) {
        this.#appended++;
        this.#displayed.append(event);
        this.#emit({ type: "append", event });
    }

    /** Retained events appended after `cursor`, oldest first. */
    since(cursor: number) {
        const count = this.#appended - cursor;
        return count > 0 ? this.#displayed.current().slice(-count) : [];
    }

    /** Collects events after `cursor` until one matches or the timeout passes. */
    waitFor(match: (event: EventInstance<EventKey>) => boolean, cursor: number, timeoutMs: number): Promise<EventWait> {
        const events = this.since(cursor);
        const i = events.findIndex(match);
        if (i >= 0) {
            return Promise.resolve({
                events: events.slice(0, i + 1),
                matched: events[i],
                cursor: this.#appended - (events.length - i - 1),
            });
        }
        return new Promise(resolve => {
            const finish = (matched?: EventInstance<EventKey>) => {
                clearTimeout(timer);
                unsub();
                resolve({ events, matched, cursor: this.#appended });
            };
            const unsub = this.subscribe(({ event }) => {
                events.push(event);
                if (match(event)) finish(event);
            });
            const timer = setTimeout(finish, timeoutMs);
        });
    }

    whenDisplayed() {
        return this.#displayed.whenPublished();
    }

    clearDisplayed() {
        this.#displayed.clear();
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
        this.#displayed.dispose();
        this.#busSub.destroy();
        this.#subs.length = 0;
        this.#subsByKey.clear();
    }

    #emit(delta: EventLogDelta) {
        // copy: waiters unsubscribe mid-dispatch
        [...this.#subs].forEach((cb) => cb(delta));
        const cbs = this.#subsByKey.get(delta.event.key);
        cbs?.forEach((cb) => cb(delta));
    }
}
