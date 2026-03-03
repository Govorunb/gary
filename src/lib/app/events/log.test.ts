import { describe, expect, test } from "vitest";
import { EventBus } from "./bus";
import { EventLogStore } from "./log.svelte";

describe("EventLogStore", () => {
    test("appends events in order and preserves IDs/timestamps", () => {
        const bus = new EventBus();
        const store = new EventLogStore(bus);

        bus.emit("test2");
        bus.emit("test1", null);
        expect(store.all.length).toBe(2);
        expect(store.all[0].key).toBe("test2");
        expect(store.all[1].key).toBe("test1");
        expect(typeof store.all[0].id).toBe("string");
        expect(typeof store.all[0].timestamp).toBe("number");
    });

    test("emits append/clear deltas", () => {
        const bus = new EventBus();
        const store = new EventLogStore(bus);
        const deltas: string[] = [];
        store.onDelta((delta) => deltas.push(delta.type));

        bus.emit("test2");
        store.clear();

        expect(deltas).toStrictEqual(["append", "clear"]);
        expect(store.all.length).toBe(0);
    });
});
