import { beforeEach, describe, expect, test, vi } from "vitest";
import { OpenAIClient, type OpenAIPrefs } from "./openai.svelte";
import type { OpenAIContext } from ".";

const openAIMock = vi.hoisted(() => ({
    create: vi.fn(),
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

        constructor(options: { baseURL: string; apiKey: string; fetch?: typeof fetch }) {
            openAIMock.constructorOptions.push(options);
            this.baseURL = options.baseURL;
            this.apiKey = options.apiKey;
            this.chat = {
                completions: {
                    create: openAIMock.create,
                },
            };
        }
    },
}));

const context = [{
    role: "user",
    content: "act",
}] satisfies OpenAIContext;

describe("OpenAIClient", () => {
    beforeEach(() => {
        openAIMock.create.mockReset();
        openAIMock.constructorOptions = [];
        tauriMock.isTauri.mockReset();
        tauriMock.isTauri.mockReturnValue(false);
        tauriMock.fetch.mockReset();
    });

    test("uses updated reactive prefs for later requests", async () => {
        const prefs = $state<OpenAIPrefs>({
            name: "OpenRouter",
            allowDoNothing: false,
            allowYapping: false,
            promptingStrategy: "json",
            reasoningEffort: "auto",
            apiKey: "test-key",
            serverUrl: "https://openrouter.ai/api/v1/",
            modelId: "openrouter/auto",
        });
        const client = new OpenAIClient({ prefs });

        openAIMock.create
            .mockRejectedValueOnce(new Error("unsupported reasoning_effort"))
            .mockResolvedValue({
                choices: [{
                    finish_reason: "stop",
                    message: { content: '{"command":{"action":"do_it"}}' },
                }],
            });

        const first = await client.genJson(context);

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

        const second = await client.genJson(context);

        expect(second.isOk()).toBe(true);
        expect(openAIMock.create).toHaveBeenCalledOnce();
        expect(openAIMock.create).toHaveBeenCalledWith(expect.objectContaining({
            model: "anthropic/claude-sonnet-4",
            reasoning_effort: "low",
        }), expect.any(Object));
    });

    test("uses tauri http fetch with localhost origin for local llm endpoints", async () => {
        const prefs = $state<OpenAIPrefs>({
            name: "Ollama",
            allowDoNothing: false,
            allowYapping: false,
            promptingStrategy: "json",
            reasoningEffort: "auto",
            apiKey: "",
            serverUrl: "http://localhost:11434/v1",
            modelId: "llama3",
        });

        new OpenAIClient({ prefs });
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
            promptingStrategy: "json",
            reasoningEffort: "auto",
            apiKey: "test-key",
            serverUrl: "https://openrouter.ai/api/v1",
            modelId: "openrouter/auto",
        });

        new OpenAIClient({ prefs });
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
