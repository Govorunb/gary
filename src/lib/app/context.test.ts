import { describe, expect, test } from "vitest";
import { ContextManager } from "./context.svelte";
import { EventBus } from "./events/bus";
import { EventLogStore } from "./events/log.svelte";

function createContext() {
    const bus = new EventBus();
    const eventLog = new EventLogStore(bus);
    const context = new ContextManager(eventLog);
    return { bus, eventLog, context };
}

describe("ContextManager projection", () => {
    test("projects user input into both views", () => {
        const { bus, context } = createContext();
        bus.emit("ui/context/input", { text: "hello", silent: false });

        expect(context.allMessages.length).toBe(1);
        expect(context.userView.length).toBe(1);
        expect(context.actorView.length).toBe(1);
        expect(context.allMessages[0].source.type).toBe("user");
        expect(context.allMessages[0].silent).toBe(false);
    });

    test("projects actor-generated output only to actor view", () => {
        const { bus, context } = createContext();
        bus.emit("api/actor/generated", { engineId: "randy", text: "{\"command\":\"wait\"}" });

        expect(context.userView.length).toBe(0);
        expect(context.actorView.length).toBe(1);
        expect(context.actorView[0].source.type).toBe("actor");
    });

    test("uses visibility rules for actor skip", () => {
        const { bus, context } = createContext();
        bus.emit("api/actor/skip", { engineId: "randy" });

        expect(context.userView.length).toBe(1);
        expect(context.actorView.length).toBe(0);
        expect(context.userView[0].silent).toBe(true);
    });

    test("notifies actor-view append subscribers", () => {
        const { bus, context } = createContext();
        let seen = 0;
        context.onActorViewAppend(() => seen++);

        bus.emit("ui/context/input", { text: "poke", silent: false });
        bus.emit("api/actor/skip", { engineId: "randy" });

        expect(seen).toBe(1);
    });

    test("reset clears projected messages only", () => {
        const { bus, context } = createContext();
        bus.emit("ui/context/input", { text: "one", silent: false });
        bus.emit("api/game/force", {
            game: { id: "g1", name: "Chess" },
            action_names: ["move"],
            query: "act now",
            priority: "medium",
        });

        expect(context.allMessages.length).toBe(2);
        context.reset();
        expect(context.allMessages.length).toBe(0);
        expect(context.userView.length).toBe(0);
        expect(context.actorView.length).toBe(0);
    });
});
