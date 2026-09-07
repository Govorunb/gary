import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ContextManager, MAX_USER_CONTEXT_EVENTS, MAX_ACTOR_CONTEXT_EVENTS } from "./context.svelte";
import { EventBus } from "./events/bus";
import { EventLogStore, MAX_DISPLAYED_EVENTS } from "./events/log.svelte";

function createContext() {
    const bus = new EventBus();
    const eventLog = new EventLogStore(bus);
    const context = new ContextManager(eventLog);
    return { bus, eventLog, context };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("ContextManager projection", () => {
    test("bounds the conversation display without truncating active engine context", () => {
        const { bus, eventLog, context } = createContext();
        let appends = 0;
        context.onActorViewAppend(() => appends++);
        const count = MAX_USER_CONTEXT_EVENTS + 10;
        for (let i = 0; i < count; i++) {
            bus.emit("ui/context/input", { text: String(i), silent: true });
        }

        vi.runAllTimers();
        expect(eventLog.displayed).toHaveLength(MAX_DISPLAYED_EVENTS);
        expect(context.userView).toHaveLength(MAX_USER_CONTEXT_EVENTS);
        expect(context.userView[0].data).toMatchObject({ text: "10" });
        expect(context.actorView).toHaveLength(count);
        expect(appends).toBe(count);
        eventLog.clearDisplayed();
        expect(context.actorView).toHaveLength(count);
        expect(context.userView).toHaveLength(MAX_USER_CONTEXT_EVENTS);
    });

    test("bounds actor context even when no engine is compacting it", () => {
        const { bus, context } = createContext();
        for (let i = 0; i < MAX_ACTOR_CONTEXT_EVENTS * 2; i++) {
            bus.emit("ui/context/input", { text: String(i), silent: true });
            expect(context.actorView.length).toBeLessThanOrEqual(MAX_ACTOR_CONTEXT_EVENTS);
        }
        expect(context.actorView[0].data).not.toMatchObject({ text: "0" });
        expect(context.actorView.at(-1)?.data).toMatchObject({ text: String(MAX_ACTOR_CONTEXT_EVENTS * 2 - 1) });
    });

    test("removes results of discarded tool calls, including results arriving later", () => {
        const { bus, context } = createContext();
        bus.emit("api/actor/generated", {
            engineId: "test", text: "",
            toolCall: { id: "old-call", name: "move", arguments: "{}" },
        });
        bus.emit("ui/context/input", { text: "keep this", silent: true });
        const retainedId = context.actorView.at(-1)!.id;
        const result = {
            game: { id: "game", name: "Chess" },
            act: { id: "action", name: "move" },
            toolCallId: "old-call",
        };
        bus.emit("api/game/act/actor", result);
        bus.emit("api/actor/generated", {
            engineId: "test", text: "",
            toolCall: { id: "retained-call", name: "move", arguments: "{}" },
        });
        bus.emit("api/game/act/actor", { ...result, toolCallId: "retained-call" });

        context.trimActorBefore(retainedId);
        bus.emit("api/game/act/actor", result);

        expect(context.actorView.map(event => event.key)).toEqual([
            "ui/context/input", "api/actor/generated", "api/game/act/actor",
        ]);
        expect(context.actorView.at(-1)?.data).toMatchObject({ toolCallId: "retained-call" });
        vi.runAllTimers();
        expect(context.userView).toHaveLength(1);

        bus.emit("ui/context/reset");
        bus.emit("api/game/act/actor", { ...result, toolCallId: "retained-call" });
        expect(context.actorView).toHaveLength(0);
    });

    test("projects user input into both views", () => {
        const { bus, context } = createContext();
        bus.emit("ui/context/input", { text: "hello", silent: false });

        vi.runAllTimers();
        expect(context.userView.length).toBe(1);
        expect(context.actorView.length).toBe(1);
        expect(context.userView[0].key).toBe("ui/context/input");
        expect(context.actorView[0].key).toBe("ui/context/input");
    });

    test("projects actor-generated output only to actor view", () => {
        const { bus, context } = createContext();
        bus.emit("api/actor/generated", { engineId: "randy", text: "{\"command\":\"wait\"}" });

        vi.runAllTimers();
        expect(context.userView.length).toBe(0);
        expect(context.actorView.length).toBe(1);
        expect(context.actorView[0].key).toBe("api/actor/generated");
    });

    test("projects tool errors only to actor context", () => {
        const { bus, context } = createContext();
        bus.emit("api/actor/tool_error", {
            engineId: "test",
            text: "",
            toolCalls: [{ id: "call-1", name: "move", arguments: "{}" }],
            message: "Invalid arguments",
        });

        vi.runAllTimers();
        expect(context.userView.length).toBe(0);
        expect(context.actorView[0].key).toBe("api/actor/tool_error");
    });

    test("uses visibility rules for actor skip", () => {
        const { bus, context } = createContext();
        bus.emit("api/actor/skip", { engineId: "randy", metrics: { latencyMs: 0 } });

        vi.runAllTimers();
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
        bus.emit("api/actor/skip", { engineId: "randy", metrics: { latencyMs: 0 } });
        bus.emit("api/game/connected", { game: { id: "g1", name: "Chess" } });
        bus.emit("api/game/action_result", { game: { id: "g1", name: "Chess" }, act: { id: "a1", name: "move" }, success: false });
        bus.emit("api/game/action_result", { game: { id: "g1", name: "Chess" }, act: { id: "a2", name: "move" }, success: true });

        expect(seen).toBe(4);
        expect(prompts).toBe(2);
    });

    test("reset events clear context without clearing the event display", () => {
        const { bus, eventLog, context } = createContext();
        bus.emit("ui/context/input", { text: "one", silent: false });
        bus.emit("api/game/force", {
            game: { id: "g1", name: "Chess" },
            action_names: ["move"],
            query: "act now",
            priority: "medium",
        });

        vi.runAllTimers();
        expect(context.userView.length).toBe(2);
        expect(context.actorView.length).toBe(2);
        bus.emit("ui/context/reset");
        expect(context.userView.length).toBe(0);
        expect(context.actorView.length).toBe(0);
        vi.runAllTimers();
        expect(eventLog.displayed.map((event) => event.key)).toEqual([
            "ui/context/input",
            "api/game/force",
            "ui/context/reset",
        ]);
    });

    test("ignores events outside explicit key subscriptions", () => {
        const { bus, context } = createContext();
        bus.emit("app/session/created", { session: { id: "s1", name: "default" } });
        vi.runAllTimers();
        expect(context.userView.length).toBe(0);
        expect(context.actorView.length).toBe(0);
    });
});
