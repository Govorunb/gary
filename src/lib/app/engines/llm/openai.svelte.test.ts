import { beforeEach, describe, expect, test, vi } from "vitest";
import { OpenAIClient, type OpenAIPrefs } from "./openai.svelte";
import type { LLMRequest, OpenAIContext } from ".";

const openAIMock = vi.hoisted(() => ({
    create: vi.fn(),
    createResponse: vi.fn(),
    constructorOptions: [] as Array<Record<string, any>>,
}));

const tauriMock = vi.hoisted(() => ({
    isTauri: vi.fn(() => false),
    fetch: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
    isTauri: tauriMock.isTauri,
}));

vi.mock("@tauri-apps/plugin-http", () => ({
    fetch: tauriMock.fetch,
}));

vi.mock("openai", () => ({
    default: class OpenAI {
        baseURL: string;
        apiKey: string;
        chat;
        responses;

        constructor(options: { baseURL: string; apiKey: string; fetch?: typeof fetch }) {
            openAIMock.constructorOptions.push(options);
            this.baseURL = options.baseURL;
            this.apiKey = options.apiKey;
            this.chat = {
                completions: {
                    create: openAIMock.create,
                },
            };
            this.responses = { create: openAIMock.createResponse };
        }
    },
}));

const context = [{
    role: "user",
    content: "act",
}] satisfies OpenAIContext;
const request = { messages: context } satisfies LLMRequest;
const HARMONY_TOKEN_TAILS = [
    "<|start|>",
    "<|end|>",
    "<|message|>",
    "<|channel|>analysis",
    "<|channel|>commentary",
    "<|channel|>final",
    "<|channel|>json",
    "<|constrain|>json",
    "<|return|>",
    "<|call|>",
] as const;

function harmonyToolCall(tail: typeof HARMONY_TOKEN_TAILS[number]) {
    return {
        choices: [{
            finish_reason: "tool_calls",
            message: {
                content: null,
                tool_calls: [{
                    id: "call-1",
                    type: "function",
                    function: { name: `move${tail}`, arguments: "{}" },
                }],
            },
        }],
    };
}

function prefsSource(prefs: OpenAIPrefs) {
    return {
        get prefs() { return prefs; },
        setReasoningEffort(effort: OpenAIPrefs["reasoningEffort"]) {
            prefs.reasoningEffort = effort;
        },
    };
}

describe("OpenAIClient", () => {
    beforeEach(() => {
        openAIMock.create.mockReset();
        openAIMock.createResponse.mockReset();
        openAIMock.constructorOptions = [];
        tauriMock.isTauri.mockReset();
        tauriMock.isTauri.mockReturnValue(false);
        tauriMock.fetch.mockReset();
    });

    test("pulls updated prefs for later requests", async () => {
        const prefs: OpenAIPrefs = {
            name: "OpenRouter",
            allowDoNothing: false,
            allowYapping: false,
            allowUnregisteredActions: false,
            promptingStrategy: "json",
            reasoningEffort: "auto",
            api: "chat",
            apiKey: "test-key",
            serverUrl: "https://openrouter.ai/api/v1/",
            modelId: "openrouter/auto",
        };
        const client = new OpenAIClient(prefsSource(prefs));

        openAIMock.create
            .mockRejectedValueOnce(new Error("400 Reasoning is mandatory for this endpoint and cannot be disabled."))
            .mockResolvedValue({
                choices: [{
                    finish_reason: "stop",
                    message: { content: '{"command":{"action":"do_it"}}' },
                }],
            });

        const first = await client.generate(request);

        expect(first.isOk()).toBe(true);
        expect(prefs.reasoningEffort).toBe("low");
        expect(openAIMock.create).toHaveBeenCalledTimes(2);
        expect(openAIMock.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
            model: "openrouter/auto",
            reasoning_effort: "none",
        }), expect.any(Object));
        expect(openAIMock.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
            model: "openrouter/auto",
            reasoning_effort: "low",
        }), expect.any(Object));

        prefs.modelId = "anthropic/claude-sonnet-4";
        openAIMock.create.mockClear();

        const second = await client.generate(request);

        expect(second.isOk()).toBe(true);
        expect(openAIMock.create).toHaveBeenCalledOnce();
        expect(openAIMock.create).toHaveBeenCalledWith(expect.objectContaining({
            model: "anthropic/claude-sonnet-4",
            reasoning_effort: "low",
        }), expect.any(Object));
    });

    test.each(HARMONY_TOKEN_TAILS)("strips a leaked Harmony token tail %s from a tool name", async (tail) => {
        const prefs = $state<OpenAIPrefs>({
            name: "OpenAI",
            allowDoNothing: false,
            allowYapping: false,
            allowUnregisteredActions: false,
            promptingStrategy: "json",
            reasoningEffort: "none",
            api: "chat",
            apiKey: "test-key",
            serverUrl: "https://api.openai.com/v1",
            modelId: "gpt-5-mini",
        });
        const client = new OpenAIClient(prefsSource(prefs));
        const tool = {
            type: "function" as const,
            function: {
                name: "move",
                parameters: { type: "object", properties: {} },
            },
        };
        openAIMock.create.mockResolvedValue(harmonyToolCall(tail));

        const result = await client.generate({
            messages: context,
            tools: [tool],
            toolChoice: "required",
        });

        expect(result._unsafeUnwrap().toolCalls).toStrictEqual([
            { id: "call-1", name: "move", arguments: "{}" },
        ]);
        expect(openAIMock.create).toHaveBeenCalledWith(expect.objectContaining({
            tools: [tool],
            tool_choice: "required",
            parallel_tool_calls: false,
        }), expect.any(Object));
    });

    test("uses the Responses API when the engine is set to", async () => {
        const prefs: OpenAIPrefs = {
            name: "OpenAI",
            allowDoNothing: false,
            allowYapping: false,
            allowUnregisteredActions: false,
            promptingStrategy: "tools",
            reasoningEffort: "low",
            api: "responses",
            apiKey: "test-key",
            serverUrl: "https://api.openai.com/v1",
            modelId: "gpt-5-mini",
        };
        const client = new OpenAIClient(prefsSource(prefs));
        const parameters = { type: "object", properties: { where: { type: "string" } } };
        openAIMock.createResponse.mockResolvedValue({
            id: "resp-1",
            created_at: 1,
            model: "gpt-5-mini",
            status: "completed",
            error: null,
            output: [
                { type: "reasoning", summary: [{ type: "summary_text", text: "The door is the way out." }] },
                { type: "function_call", call_id: "call-2", name: "move", arguments: '{"where":"door"}' },
            ],
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        });

        const result = await client.generate({
            messages: [
                { role: "system", content: "Play the game" },
                { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "look", arguments: "{}" } }] },
                { role: "tool", tool_call_id: "call-1", content: "A door." },
                { role: "user", content: "act" },
            ],
            tools: [{ type: "function", function: { name: "move", description: "Move", parameters } }],
            toolChoice: "required",
            maxTokens: 100,
        });

        expect(openAIMock.create).not.toHaveBeenCalled();
        expect(openAIMock.createResponse).toHaveBeenCalledWith({
            model: "gpt-5-mini",
            store: false,
            stream: false,
            instructions: "Play the game",
            input: [
                { type: "function_call", call_id: "call-1", name: "look", arguments: "{}" },
                { type: "function_call_output", call_id: "call-1", output: "A door." },
                { role: "user", content: "act" },
            ],
            tools: [{ type: "function", name: "move", description: "Move", parameters, strict: false }],
            parallel_tool_calls: false,
            tool_choice: "required",
            reasoning: { effort: "low", summary: "auto" },
            max_output_tokens: 100,
        }, expect.any(Object));
        expect(result._unsafeUnwrap()).toMatchObject({
            text: "",
            toolCalls: [{ id: "call-2", name: "move", arguments: '{"where":"door"}' }],
            metadata: { reasoning: "The door is the way out.", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
        });
    });

    test("surfaces provider errors returned in a completion choice", async () => {
        const prefs = $state<OpenAIPrefs>({
            name: "OpenRouter",
            allowDoNothing: false,
            allowYapping: false,
            allowUnregisteredActions: false,
            promptingStrategy: "tools",
            reasoningEffort: "none",
            api: "chat",
            apiKey: "test-key",
            serverUrl: "https://openrouter.ai/api/v1",
            modelId: "openai/gpt-oss-120b",
        });
        const client = new OpenAIClient(prefsSource(prefs));
        openAIMock.create.mockResolvedValue({
            choices: [{
                finish_reason: "error",
                error: {
                    code: 502,
                    message: "Tool call validation failed: attempted to call unavailable tool 'serve_customer'",
                    metadata: { error_type: "provider_unavailable" },
                },
                message: { content: null },
            }],
        });

        const result = await client.generate(request);

        const error = result._unsafeUnwrapErr();
        expect(error).not.toBe("cancelled");
        if (error === "cancelled") throw new Error("Expected an engine error");
        expect(error.message).toBe("OpenRouter generation failed");
        expect(error.cause).toMatchObject({
            message: "Tool call validation failed: attempted to call unavailable tool 'serve_customer'",
        });
        expect(error.recoverable).toBe(true);
    });

    test("sends a strict structured output schema", async () => {
        const prefs = $state<OpenAIPrefs>({
            name: "OpenAI",
            allowDoNothing: false,
            allowYapping: false,
            allowUnregisteredActions: false,
            promptingStrategy: "json",
            reasoningEffort: "none",
            api: "chat",
            apiKey: "test-key",
            serverUrl: "https://api.openai.com/v1",
            modelId: "gpt-5-mini",
        });
        const client = new OpenAIClient(prefsSource(prefs));
        const responseSchema = {
            type: "object" as const,
            properties: { command: { type: "string" as const } },
            required: ["command"],
            additionalProperties: false,
        };
        openAIMock.create.mockResolvedValue({
            choices: [{
                finish_reason: "stop",
                message: { content: JSON.stringify({ command: "wait" }) },
            }],
        });

        const result = await client.generate({ messages: context, responseSchema });

        expect(result._unsafeUnwrap()).toMatchObject({
            text: JSON.stringify({ command: "wait" }),
            toolCalls: [],
        });
        expect(openAIMock.create).toHaveBeenCalledWith(expect.objectContaining({
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "gary_action",
                    schema: responseSchema,
                    strict: true,
                },
            },
        }), expect.any(Object));
    });

    test.each([
        ["https://openrouter.ai/api/v1", "anthropic/claude-sonnet-4", true],
        ["https://openrouter.ai/api/v1", "~anthropic/claude-sonnet-latest", true],
        ["https://openrouter.ai/api/v1", "openai/gpt-5", false],
        ["https://api.openai.com/v1", "gpt-5", false],
        ["http://localhost:1234/v1", "anthropic/claude-sonnet-4", false],
        ["https://openrouter.ai/api/v1", "@preset/chess", false],
    ])("marks only the stable system block for %s %s", async (serverUrl, modelId, cached) => {
        const prefs: OpenAIPrefs = {
            name: "Test",
            allowDoNothing: false,
            allowYapping: false,
            allowUnregisteredActions: false,
            promptingStrategy: "tools",
            reasoningEffort: "none",
            api: "chat",
            apiKey: "test-key",
            serverUrl,
            modelId,
        };
        const client = new OpenAIClient(prefsSource(prefs));
        const messages = [
            { role: "system", content: "Stable instructions" },
            { role: "user", content: "Current context and active actions" },
        ] satisfies OpenAIContext;
        openAIMock.create.mockResolvedValue({
            choices: [{ finish_reason: "stop", message: { content: "hello" } }],
        });

        const result = await client.generate({ messages });

        expect(result.isOk()).toBe(true);
        const params = openAIMock.create.mock.calls[0][0];
        expect(params).not.toHaveProperty("cache_control");
        expect(params.messages).toEqual(cached ? [
            { role: "system", content: [{ type: "text", text: "Stable instructions", cache_control: { type: "ephemeral" } }] },
            messages[1],
        ] : messages);
        expect(messages[0].content).toBe("Stable instructions");
    });

    test("uses tauri http fetch with localhost origin for local llm endpoints", async () => {
        const prefs = $state<OpenAIPrefs>({
            name: "Ollama",
            allowDoNothing: false,
            allowYapping: false,
            allowUnregisteredActions: false,
            promptingStrategy: "json",
            reasoningEffort: "auto",
            api: "chat",
            apiKey: "",
            serverUrl: "http://localhost:11434/v1",
            modelId: "llama3",
        });

        new OpenAIClient(prefsSource(prefs));
        const customFetch = openAIMock.constructorOptions.at(-1)?.fetch as typeof fetch;
        tauriMock.isTauri.mockReturnValue(true);
        tauriMock.fetch.mockResolvedValueOnce(new Response("{}"));

        await customFetch("http://localhost:11434/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: "Bearer token" },
        });

        expect(tauriMock.fetch).toHaveBeenCalledOnce();
        const [, init] = tauriMock.fetch.mock.calls[0];
        const headers = init?.headers as Headers;
        expect(headers.get("Origin")).toBe("http://localhost");
        expect(headers.get("Authorization")).toBe("Bearer token");
    });

    test("does not set origin for public openai-compatible endpoints", async () => {
        const prefs = $state<OpenAIPrefs>({
            name: "OpenRouter",
            allowDoNothing: false,
            allowYapping: false,
            allowUnregisteredActions: false,
            promptingStrategy: "json",
            reasoningEffort: "auto",
            api: "chat",
            apiKey: "test-key",
            serverUrl: "https://openrouter.ai/api/v1",
            modelId: "openrouter/auto",
        });

        new OpenAIClient(prefsSource(prefs));
        const customFetch = openAIMock.constructorOptions.at(-1)?.fetch as typeof fetch;
        tauriMock.isTauri.mockReturnValue(true);
        tauriMock.fetch.mockResolvedValueOnce(new Response("{}"));

        const init = {
            method: "POST",
            headers: { Authorization: "Bearer token" },
        };
        await customFetch("https://openrouter.ai/api/v1/chat/completions", init);

        expect(tauriMock.fetch).toHaveBeenCalledWith(
            "https://openrouter.ai/api/v1/chat/completions",
            init,
        );
    });
});
