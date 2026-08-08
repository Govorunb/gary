import { describe, expect, test } from "vitest";
import { EventBus } from "./bus";
import { EventLogStore } from "./log.svelte";

describe("EventLogStore", () => {
    test("clears displayed events while retaining the source history", () => {
        const bus = new EventBus();
        const eventLog = new EventLogStore(bus);
        bus.emit("ui/context/input", { text: "before", silent: false });

        eventLog.clearDisplayed();
        bus.emit("ui/context/input", { text: "after", silent: false });

        expect(eventLog.all).toMatchObject([
            { key: "ui/context/input", data: { text: "before" } },
            { key: "ui/context/input", data: { text: "after" } },
        ]);
        expect(eventLog.displayed).toMatchObject([
            { key: "ui/context/input", data: { text: "after" } },
        ]);
    });
});
