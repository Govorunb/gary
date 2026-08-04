import type { Action } from "$lib/api/v1/spec";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import type { Session } from "$lib/app/session.svelte";
import { SelfTestHarness } from "$lib/testing/self-test-harness";
import { okAsync, type ResultAsync } from "neverthrow";
import { describe, expect, test } from "vitest";
import type { EngineActError } from "../index.svelte";
import { EVENT_BUS } from "$lib/app/events/bus";
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
        modelMetadata: { test: { contextWindow: 100_000 } },
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
    generations: LLMGeneration[] = [];
    requests: LLMRequest[] = [];
    model = "test";

    constructor(options: CommonLLMOptions) {
        super({ engines: { test: options } } as unknown as UserPrefs, "test");
    }

    protected modelId(): string {
        return this.model;
    }

    protected generate(request: LLMRequest): ResultAsync<LLMGeneration, EngineActError> {
        this.requests.push(request);
        return okAsync(this.generations.shift() ?? this.generation);
    }
}

describe("LLMEngine tool calling", () => {
    test("instructs the model to make at most one tool call", async () => {
        const engine = new TestLLMEngine(llmOptions());
        engine.generation = {
            text: "",
            toolCalls: [{ id: "call-1", name: "move", arguments: "{}" }],
        };

        await engine.tryAct(createSession(), [{ name: "move" }]);

        expect(engine.requests[0].messages[0].content).toContain("Call at most one tool per response.");
    });

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
            toolCalls: [{ id: "call-1", name: "move", arguments: '{"data":{"square":"e4"}}' }],
        };

        const result = await engine.tryAct(createSession(), [action]);

        expect(result._unsafeUnwrap()).toMatchObject({ name: "move", data: '{"square":"e4"}' });
        expect(engine.requests[0].tools?.[0].function.parameters).toStrictEqual({
            type: "object",
            properties: {
                data: {
                    type: "object",
                    properties: { square: { type: "string" } },
                    additionalProperties: false,
                },
            },
            required: ["data"],
            additionalProperties: false,
        });
    });

    test("wraps primitive action schemas in a data parameter", async () => {
        const engine = new TestLLMEngine(llmOptions());
        const action = await registeredAction({ name: "pick_number", schema: { type: "integer" } });
        engine.generation = {
            text: "",
            toolCalls: [{ id: "call-1", name: "pick_number", arguments: '{"data":42}' }],
        };

        const result = await engine.tryAct(createSession(), [action]);

        expect(result._unsafeUnwrap()).toMatchObject({ name: "pick_number", data: "42" });
        expect(engine.requests[0].tools?.[0].function.parameters).toStrictEqual({
            type: "object",
            properties: { data: { type: "integer", additionalProperties: false } },
            required: ["data"],
            additionalProperties: false,
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

    test("lists callable tool schemas as available actions in the system prompt", async () => {
        const engine = new TestLLMEngine(llmOptions());
        const actions: Action[] = [
            { name: "move", description: "Move a piece" },
            { name: "<b>html_inject</b>", description: "Test HTML injection" },
        ];
        engine.generation = {
            text: "",
            toolCalls: [{ id: "call-1", name: "move", arguments: "{}" }],
        };

        await engine.tryAct(createSession(), actions);

        const systemPrompt = engine.requests[0].messages[0].content;
        expect(systemPrompt).toContain("## Available actions");
        for (const tool of engine.requests[0].tools!) {
            expect(systemPrompt).toContain(`- ${JSON.stringify(tool.function)}`);
        }
    });

    test("repeats the complete current tool inventory at the live edge", async () => {
        const engine = new TestLLMEngine(llmOptions());
        engine.generation = {
            text: "",
            toolCalls: [{ id: "call-1", name: "current_action", arguments: "{}" }],
        };

        await engine.tryAct(createSession(), [{ name: "current_action" }]);

        const closer = engine.requests[0].messages.at(-1)?.content;
        expect(closer).toContain("Currently available client action tools (complete list): `current_action`.");
        expect(closer).toContain("Do not call a client action tool from an earlier turn");
    });

    test("retries an invalid tool call with context feedback", async () => {
        const toolErrors: any[] = [];
        const subscription = EVENT_BUS.subscribe(["api/actor/tool_error"]);
        subscription.onnext(event => toolErrors.push(event));
        const engine = new TestLLMEngine(llmOptions());
        const harness = new SelfTestHarness();
        const action = await registeredAction({
            name: "move",
            schema: {
                type: "object",
                properties: { square: { type: "string" } },
            },
        });
        engine.generations = [
            {
                text: "",
                toolCalls: [{ id: "call-1", name: "move", arguments: '{"square":"e4"}' }],
            },
            {
                text: "",
                toolCalls: [{ id: "call-2", name: "move", arguments: '{"data":{"square":"e4"}}' }],
            },
        ];

        try {
            const result = await engine.tryAct(harness.session as unknown as Session, [action]);

            expect(result._unsafeUnwrap()).toMatchObject({ name: "move", data: '{"square":"e4"}' });
            expect(engine.requests).toHaveLength(2);
            expect(toolErrors).toHaveLength(1);
            expect(toolErrors[0].data).toMatchObject({
                engineId: "test",
                message: "Arguments must be an object containing exactly one property named 'data'. Put the action arguments inside 'data'.",
            });
            expect(engine.requests[1].messages.slice(-3, -1)).toStrictEqual([
                {
                    role: "assistant",
                    content: null,
                    tool_calls: [{
                        id: "call-1",
                        type: "function",
                        function: { name: "move", arguments: '{"square":"e4"}' },
                    }],
                },
                {
                    role: "tool",
                    tool_call_id: "call-1",
                    content: JSON.stringify({ isError: true, message: toolErrors[0].data.message }),
                },
            ]);
        } finally {
            subscription.destroy();
            harness.session.context.dispose();
            harness.session.eventLog.dispose();
        }
    });

    test("returns an invalid tool call error after one retry", async () => {
        const engine = new TestLLMEngine(llmOptions());
        engine.generations = [
            { text: "", toolCalls: [{ id: "call-1", name: "old_action", arguments: "{}" }] },
            { text: "", toolCalls: [{ id: "call-2", name: "old_action", arguments: "{}" }] },
        ];

        const result = await engine.tryAct(createSession(), [{ name: "current_action" }]);

        expect(result._unsafeUnwrapErr()).toMatchObject({ recoverable: true });
        expect(engine.requests).toHaveLength(2);
    });

    test("returns an error result for every rejected parallel tool call", async () => {
        const engine = new TestLLMEngine(llmOptions());
        const harness = new SelfTestHarness();
        engine.generations = [
            {
                text: "",
                toolCalls: [
                    { id: "call-1", name: "move", arguments: "{}" },
                    { id: "call-2", name: "move", arguments: "{}" },
                ],
            },
            { text: "", toolCalls: [{ id: "call-3", name: "move", arguments: "{}" }] },
        ];

        try {
            await engine.tryAct(harness.session as unknown as Session, [{ name: "move" }]);

            expect(engine.requests[1].messages.slice(-4, -1)).toStrictEqual([
                {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                        {
                            id: "call-1",
                            type: "function",
                            function: { name: "move", arguments: "{}" },
                        },
                        {
                            id: "call-2",
                            type: "function",
                            function: { name: "move", arguments: "{}" },
                        },
                    ],
                },
                {
                    role: "tool",
                    tool_call_id: "call-1",
                    content: expect.stringContaining('"isError":true'),
                },
                {
                    role: "tool",
                    tool_call_id: "call-2",
                    content: expect.stringContaining('"isError":true'),
                },
            ]);
        } finally {
            harness.session.context.dispose();
            harness.session.eventLog.dispose();
        }
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

        expect(result._unsafeUnwrapErr()).toMatchObject({
            recoverable: false,
        });
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
        const commands = (engine.requests[0].responseSchema!.properties!.command as any).anyOf;
        expect(commands).toHaveLength(3);
    });

    test("reports empty structured output before parsing it", async () => {
        const engine = new TestLLMEngine(llmOptions({ promptingStrategy: "json" }));
        engine.generation = { text: "", toolCalls: [] };

        const result = await engine.tryAct(createSession(), [{ name: "move" }]);

        expect(result._unsafeUnwrapErr()).toMatchObject({ message: "Model returned no structured output" });
    });

    test("rejects unavailable actions even when the provider ignores the schema", async () => {
        const engine = new TestLLMEngine(llmOptions({ promptingStrategy: "json" }));
        engine.generation = {
            text: JSON.stringify({ command: { action: "invented_action" } }),
            toolCalls: [],
        };

        const result = await engine.tryAct(createSession(), [{ name: "move" }]);

        expect(result._unsafeUnwrapErr()).toMatchObject({
            message: "Model selected unavailable action 'invented_action'",
            recoverable: true,
        });
    });
});

describe("LLMEngine context trimming", () => {
    test("compacts a contiguous prefix and remembers the boundary", async () => {
        const session = createSession();
        (session.context.actorView as any[]).push(...Array.from({ length: 20 }, (_, index) => ({
            id: `event-${index}`,
            timestamp: 1_000 + index,
            key: "ui/context/input",
            data: {
                text: index < 4
                    ? `old-prefix-${index} `.repeat(500)
                    : `live-${index}`,
                silent: false,
            },
        })));
        const original = structuredClone(session.context.actorView);
        const engine = new TestLLMEngine(llmOptions({
            allowYapping: true,
            modelMetadata: { test: { contextWindow: 6_800 } },
        }));
        engine.generation = { text: "okay", toolCalls: [] };

        const result = await engine.tryAct(session);

        expect(result.isOk()).toBe(true);
        const firstWire = JSON.stringify(engine.requests[0].messages);
        expect(firstWire).not.toContain("old-prefix");
        expect(firstWire).toContain("live-4");
        expect(firstWire).toContain("live-19");
        expect(session.context.actorView).toStrictEqual(original);

        (session.context.actorView as any[]).push({
            id: "event-20",
            timestamp: 1_020,
            key: "ui/context/input",
            data: { text: "new-live-event", silent: false },
        });
        expect((await engine.tryAct(session)).isOk()).toBe(true);
        const secondWire = JSON.stringify(engine.requests[1].messages);
        expect(secondWire).not.toContain("old-prefix");
        expect(secondWire).toContain("live-4");
        expect(secondWire).toContain("new-live-event");

        (session.context.actorView as any[]).splice(0, session.context.actorView.length, {
            id: "reset-event",
            timestamp: 2_000,
            key: "ui/context/input",
            data: { text: "context after reset", silent: false },
        });
        expect((await engine.tryAct(session)).isOk()).toBe(true);
        expect(JSON.stringify(engine.requests[2].messages)).toContain("context after reset");
    });

    test("compacts history outside the live time window", async () => {
        const session = createSession();
        (session.context.actorView as any[]).push(
            {
                id: "old",
                timestamp: 1,
                key: "ui/context/input",
                data: { text: "stale ".repeat(2_000), silent: false },
            },
            {
                id: "recent",
                timestamp: 5 * 60 * 1_000 + 2,
                key: "ui/context/input",
                data: { text: "recent context", silent: false },
            },
        );
        const engine = new TestLLMEngine(llmOptions({
            allowYapping: true,
            modelMetadata: { test: { contextWindow: 6_800 } },
        }));
        engine.generation = { text: "okay", toolCalls: [] };

        expect((await engine.tryAct(session)).isOk()).toBe(true);
        const wire = JSON.stringify(engine.requests[0].messages);
        expect(wire).not.toContain("stale stale");
        expect(wire).toContain("recent context");
    });

    test("removes tool calls and their results atomically", async () => {
        const session = createSession();
        (session.context.actorView as any[]).push(
            {
                id: "generated",
                timestamp: 1,
                key: "api/actor/generated",
                data: {
                    engineId: "test",
                    text: "",
                    toolCall: {
                        id: "call-1",
                        name: "move",
                        arguments: JSON.stringify({ note: "old ".repeat(1_000) }),
                    },
                },
            },
            {
                id: "sent",
                timestamp: 2,
                key: "api/game/act/actor",
                data: {
                    game: { id: "game-1", name: "Chess" },
                    act: { id: "action-1", name: "move" },
                    toolCallId: "call-1",
                },
            },
            {
                id: "latest",
                timestamp: 3,
                key: "api/game/context",
                data: {
                    game: { id: "game-1", name: "Chess" },
                    message: "Your opponent moved.",
                    silent: false,
                },
            },
        );
        const engine = new TestLLMEngine(llmOptions({
            modelMetadata: { test: { contextWindow: 5_000 } },
        }));
        engine.generation = {
            text: "",
            toolCalls: [{ id: "call-2", name: "move", arguments: "{}" }],
        };

        const result = await engine.tryAct(session, [{ name: "move" }]);

        expect(result.isOk()).toBe(true);
        const wire = JSON.stringify(engine.requests[0].messages);
        expect(wire).not.toContain("call-1");
        expect(wire).not.toContain("Action sent to Chess");
        expect(wire).toContain("Your opponent moved.");
    });

    test("fails before inference when mandatory content cannot fit", async () => {
        const engine = new TestLLMEngine(llmOptions({
            allowYapping: true,
            modelMetadata: { test: { contextWindow: 1_024 } },
        }));
        engine.generation = { text: "okay", toolCalls: [] };

        const result = await engine.tryAct(createSession());

        expect(result._unsafeUnwrapErr()).toBeInstanceOf(ConfigError);
        expect(result._unsafeUnwrapErr()).toMatchObject({
            message: expect.stringContaining("exceed the 1024-token context window"),
        });
        expect(engine.requests).toHaveLength(0);
    });

    test("does not apply one model's override to another model", async () => {
        const engine = new TestLLMEngine(llmOptions({
            allowYapping: true,
            modelMetadata: { test: { contextWindow: 100_000 } },
        }));
        engine.generation = { text: "okay", toolCalls: [] };

        engine.model = "other";
        const unknown = await engine.tryAct(createSession());
        expect(unknown._unsafeUnwrapErr()).toMatchObject({
            message: "Test LLM needs a context window for model 'other'",
        });

        engine.model = "test";
        const restored = await engine.tryAct(createSession());
        expect(restored.isOk()).toBe(true);
    });

    test("records the resolved budget and provider prompt usage", async () => {
        const generatedEvents: any[] = [];
        const subscription = EVENT_BUS.subscribe(["api/actor/generated"]);
        subscription.onnext(event => generatedEvents.push(event));
        const engine = new TestLLMEngine(llmOptions({ allowYapping: true }));
        engine.generation = {
            text: "okay",
            toolCalls: [],
            metadata: { usage: { prompt_tokens: 321 } },
        };

        try {
            const result = await engine.tryAct(createSession());

            expect(result.isOk()).toBe(true);
            expect(engine.requests[0].maxTokens).toBe(4_096);
            expect(generatedEvents.at(-1).data.metadata.context).toMatchObject({
                contextWindow: 100_000,
                source: "override",
                model: "test",
                completionReserve: 4_096,
                reportedPromptTokens: 321,
            });
        } finally {
            subscription.destroy();
        }
    });
});
