import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { EventBus } from "./bus";
import { EventLogStore } from "./log.svelte";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("EventLogStore", () => {
    test("clears the event display without interrupting subscribers", () => {
        const bus = new EventBus();
        const eventLog = new EventLogStore(bus);
        const received: string[] = [];
        eventLog.subscribe(["ui/context/input"], ({ event }) => received.push(event.id));
        bus.emit("ui/context/input", { text: "before", silent: false });

        eventLog.clearDisplayed();
        bus.emit("ui/context/input", { text: "after", silent: false });

        expect(received).toHaveLength(2);
        vi.runAllTimers();
        expect(eventLog.displayed).toMatchObject([
            { key: "ui/context/input", data: { text: "after" } },
        ]);
    });
});
