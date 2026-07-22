import type { Action } from "$lib/api/v1/spec";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import type { Session } from "$lib/app/session.svelte";
import { SelfTestHarness } from "$lib/testing/self-test-harness";
import { okAsync, type ResultAsync } from "neverthrow";
import { describe, expect, test } from "vitest";
import type { EngineActError } from "../index.svelte";
import {
    ConfigError,
    LLMEngine,
    type CommonLLMOptions,
    type LLMGeneration,
    type LLMRequest,
} from ".";

function llmOptions(options: Partial<CommonLLMOptions> = {}): CommonLLMOptions {
    return {
        allowDoNothing: false,
        allowYapping: false,
        promptingStrategy: "tools",
        ...options,
    };
}

function createSession(): Session {
    return {
        registry: { games: [] },
        context: { actorView: [] },
        userPrefs: { app: {} },
    } as unknown as Session;
}

async function registeredAction(action: Action): Promise<Action> {
    const harness = new SelfTestHarness();
    await harness.server.registerActions([action]);
    return harness.server.getAction(action.name)!;
}

class TestLLMEngine extends LLMEngine<CommonLLMOptions> {
    readonly name = "Test LLM";
    generation: LLMGeneration = { text: "", toolCalls: [] };
    requests: LLMRequest[] = [];

    constructor(options: CommonLLMOptions) {
        super({ engines: { test: options } } as unknown as UserPrefs, "test");
    }

    protected generate(request: LLMRequest): ResultAsync<LLMGeneration, EngineActError> {
        this.requests.push(request);
        return okAsync(this.generation);
    }
}

describe("LLMEngine tool calling", () => {
    test("clones reactive action schemas", async () => {
        const engine = new TestLLMEngine(llmOptions());
        const action = await registeredAction({
            name: "move",
            schema: {
                type: "object",
                properties: { square: { type: "string" } },
            },
        });
        engine.generation = {
            text: "",
            toolCalls: [{ id: "call-1", name: "move", arguments: '{"square":"e4"}' }],
        };

        const result = await engine.tryAct(createSession(), [action]);

        expect(result._unsafeUnwrap()).toMatchObject({ name: "move" });
        expect(engine.requests[0].tools?.[0].function.parameters).toStrictEqual({
            type: "object",
            properties: { square: { type: "string" } },
        });
    });

    test("skips without generating when no actions are available", async () => {
        const engine = new TestLLMEngine(llmOptions({ allowDoNothing: true }));

        const result = await engine.tryAct(createSession(), []);

        expect(result._unsafeUnwrap()).toBe("skip");
        expect(engine.requests).toHaveLength(0);
    });

    test("uses ordinary output for yapping", async () => {
        const engine = new TestLLMEngine(llmOptions({ allowYapping: true }));
        engine.generation = { text: "hello", toolCalls: [] };

        const result = await engine.tryAct(createSession(), []);

        expect(result._unsafeUnwrap()).toStrictEqual({ say: "hello", notify: false });
        expect(engine.requests[0].tools).toBeUndefined();
    });

    test("maps safe unique tool names back to actions", async () => {
        const engine = new TestLLMEngine(llmOptions());
        const actions: Action[] = [
            { name: "move (Chess abc123)", description: "Move a piece" },
            { name: "move_Chess_abc123", description: "Other move" },
        ];
        engine.generation = {
            text: "",
            toolCalls: [{ id: "call-1", name: "move__Chess_abc123_", arguments: "{}" }],
        };

        const result = await engine.tryAct(createSession(), actions);

        expect(result._unsafeUnwrap()).toStrictEqual({
            name: "move (Chess abc123)",
            data: null,
            toolCallId: "call-1",
        });
        expect(engine.requests[0].tools?.map(tool => tool.function.name)).toStrictEqual([
            "move__Chess_abc123_",
            "move_Chess_abc123",
        ]);
        expect(engine.requests[0].toolChoice).toBe("required");
    });

    test("offers wait alongside actions", async () => {
        const engine = new TestLLMEngine(llmOptions({ allowDoNothing: true }));
        engine.generation = {
            text: "",
            toolCalls: [{ id: "wait-1", name: "__wait__", arguments: "{}" }],
        };

        const result = await engine.tryAct(createSession(), [{ name: "move" }]);

        expect(result._unsafeUnwrap()).toBe("skip");
        expect(engine.requests[0].tools?.map(tool => tool.function.name)).toStrictEqual(["move", "__wait__"]);
    });

    test("keeps ephemeral force context out of later requests", async () => {
        const engine = new TestLLMEngine(llmOptions());
        const action = { name: "move" };
        engine.generation = {
            text: "",
            toolCalls: [{ id: "move-1", name: "move", arguments: "{}" }],
        };

        await engine.forceAct(createSession(), [action], undefined, {
            query: "pick the winning move",
            state: "final round",
            ephemeral_context: true,
            action_names: ["move"],
            priority: "high",
        });
        await engine.tryAct(createSession(), [action]);

        expect(JSON.stringify(engine.requests[0].messages)).toContain("pick the winning move");
        expect(JSON.stringify(engine.requests[1].messages)).not.toContain("pick the winning move");
    });

    test("replays action calls with their tool result", async () => {
        const session = createSession();
        (session.context.actorView as any[]).push(
            {
                id: "generated",
                timestamp: 1,
                key: "api/actor/generated",
                data: {
                    engineId: "test",
                    text: "",
                    toolCall: { id: "call-1", name: "move", arguments: "{}" },
                },
            },
            {
                id: "sent",
                timestamp: 2,
                key: "api/game/context",
                data: {
                    game: { id: "game-1", name: "Chess" },
                    message: "The clock is ticking",
                    silent: true,
                },
            },
            {
                id: "tool-result",
                timestamp: 3,
                key: "api/game/act/actor",
                data: {
                    game: { id: "game-1", name: "Chess" },
                    act: { id: "action-1", name: "move" },
                    toolCallId: "call-1",
                },
            },
        );
        const engine = new TestLLMEngine(llmOptions());
        engine.generation = {
            text: "",
            toolCalls: [{ id: "call-2", name: "move", arguments: "{}" }],
        };

        await engine.tryAct(session, [{ name: "move" }]);

        expect(engine.requests[0].messages.slice(1, 3)).toStrictEqual([
            {
                role: "assistant",
                content: null,
                tool_calls: [{
                    id: "call-1",
                    type: "function",
                    function: { name: "move", arguments: "{}" },
                }],
            },
            {
                role: "tool",
                tool_call_id: "call-1",
                content: "Action sent to Chess (request ID action-1).",
            },
        ]);
        expect(JSON.stringify(engine.requests[0].messages[3])).toContain("The clock is ticking");
    });

    test("returns a config error without anything to do", async () => {
        const engine = new TestLLMEngine(llmOptions());

        const result = await engine.tryAct(createSession(), []);

        expect(result._unsafeUnwrapErr()).toBeInstanceOf(ConfigError);
        expect(engine.requests).toHaveLength(0);
    });
});

describe("LLMEngine structured output", () => {
    test("requests a response schema and parses an action", async () => {
        const engine = new TestLLMEngine(llmOptions({ promptingStrategy: "json" }));
        engine.generation = {
            text: JSON.stringify({ command: { action: "move", data: { square: "e4" } } }),
            toolCalls: [],
        };

        const action = await registeredAction({
            name: "move",
            description: "Move a piece",
            schema: {
                type: "object",
                properties: { square: { type: "string" } },
                required: ["square"],
            },
        });

        const result = await engine.tryAct(createSession(), [action]);

        expect(result._unsafeUnwrap()).toStrictEqual({
            name: "move",
            data: JSON.stringify({ square: "e4" }),
        });
        expect(engine.requests[0].tools).toBeUndefined();
        expect(engine.requests[0].responseSchema).toMatchObject({
            type: "object",
            properties: { command: { anyOf: expect.any(Array) } },
            required: ["command"],
            additionalProperties: false,
        });
    });

    test("includes configured optional commands in the response schema", async () => {
        const engine = new TestLLMEngine(llmOptions({
            promptingStrategy: "json",
            allowDoNothing: true,
            allowYapping: true,
        }));
        engine.generation = { text: JSON.stringify({ command: { say: "hello", notify: true } }), toolCalls: [] };

        const result = await engine.tryAct(createSession(), [{ name: "move" }]);

        expect(result._unsafeUnwrap()).toStrictEqual({ say: "hello", notify: true });
        const commands = (engine.requests[0].responseSchema?.properties?.command as any).anyOf;
        expect(commands).toHaveLength(3);
    });

    test("rejects unavailable actions even when the provider ignores the schema", async () => {
        const engine = new TestLLMEngine(llmOptions({ promptingStrategy: "json" }));
        engine.generation = {
            text: JSON.stringify({ command: { action: "invented_action" } }),
            toolCalls: [],
        };

        const result = await engine.tryAct(createSession(), [{ name: "move" }]);

        expect(result._unsafeUnwrapErr()).toMatchObject({ message: "Model selected unavailable action 'invented_action'" });
    });
});
