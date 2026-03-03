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

        expect(context.userView.length).toBe(1);
        expect(context.actorView.length).toBe(1);
        expect(context.userView[0].key).toBe("ui/context/input");
        expect(context.actorView[0].key).toBe("ui/context/input");
    });

    test("projects actor-generated output only to actor view", () => {
        const { bus, context } = createContext();
        bus.emit("api/actor/generated", { engineId: "randy", text: "{\"command\":\"wait\"}" });

        expect(context.userView.length).toBe(0);
        expect(context.actorView.length).toBe(1);
        expect(context.actorView[0].key).toBe("api/actor/generated");
    });

    test("uses visibility rules for actor skip", () => {
        const { bus, context } = createContext();
        bus.emit("api/actor/skip", { engineId: "randy" });

        expect(context.userView.length).toBe(1);
        expect(context.actorView.length).toBe(0);
        expect(context.userView[0].key).toBe("api/actor/skip");
    });

    test("notifies actor-view append subscribers", () => {
        const { bus, context } = createContext();
        let seen = 0;
        let prompts = 0;
        context.onActorViewAppend((_event, shouldPrompt) => {
            seen++;
            if (shouldPrompt) prompts++;
        });

        bus.emit("ui/context/input", { text: "poke", silent: false });
        bus.emit("api/actor/skip", { engineId: "randy" });
        bus.emit("api/game/connected", { game: { id: "g1", name: "Chess" } });

        expect(seen).toBe(2);
        expect(prompts).toBe(1);
    });

    test("reset clears user/actor projections", () => {
        const { bus, context } = createContext();
        bus.emit("ui/context/input", { text: "one", silent: false });
        bus.emit("api/game/force", {
            game: { id: "g1", name: "Chess" },
            action_names: ["move"],
            query: "act now",
            priority: "medium",
        });

        expect(context.userView.length).toBe(2);
        expect(context.actorView.length).toBe(2);
        context.reset();
        expect(context.userView.length).toBe(0);
        expect(context.actorView.length).toBe(0);
    });

    test("ignores events outside explicit key subscriptions", () => {
        const { bus, context } = createContext();
        bus.emit("app/session/created", { session: { id: "s1", name: "default" } });
        expect(context.userView.length).toBe(0);
        expect(context.actorView.length).toBe(0);
    });
});
