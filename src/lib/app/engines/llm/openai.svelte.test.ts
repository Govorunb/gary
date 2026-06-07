import { describe, expect, test, vi } from "vitest";
import { OpenAIClient, type OpenAIPrefs } from "./openai.svelte";
import type { OpenAIContext } from ".";

const openAIMock = vi.hoisted(() => ({
    create: vi.fn(),
}));

vi.mock("openai", () => ({
    default: class OpenAI {
        baseURL: string;
        apiKey: string;
        chat;

        constructor(options: { baseURL: string; apiKey: string }) {
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
});
