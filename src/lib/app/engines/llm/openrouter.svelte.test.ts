import { afterEach, describe, expect, test, vi } from "vitest";
import { getOpenRouterModelMetadata } from "./openrouter.svelte";
import { ConfigError } from ".";

describe("OpenRouter model metadata", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("loads a model context window", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: { context_length: 131_072 },
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: { context_length: 200_000 },
            }), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        const result = await getOpenRouterModelMetadata("test-key", "anthropic/claude:free");
        const cachedResult = await getOpenRouterModelMetadata("test-key", "anthropic/claude:free");
        const refreshedResult = await getOpenRouterModelMetadata(
            "test-key",
            "anthropic/claude:free",
            { refresh: true },
        );

        expect(result._unsafeUnwrap()).toStrictEqual({ contextWindow: 131_072 });
        expect(cachedResult._unsafeUnwrap()).toStrictEqual({ contextWindow: 131_072 });
        expect(refreshedResult._unsafeUnwrap()).toStrictEqual({ contextWindow: 200_000 });
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "https://openrouter.ai/api/v1/model/anthropic/claude%3Afree",
            { headers: { Authorization: "Bearer test-key" } },
        );
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test("does not request model metadata without an API key", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const result = await getOpenRouterModelMetadata("", "anthropic/claude");

        expect(result._unsafeUnwrapErr()).toBeInstanceOf(ConfigError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("requires overrides for presets without making a request", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const result = await getOpenRouterModelMetadata("test-key", "@preset/chess");

        expect(result._unsafeUnwrapErr()).toBeInstanceOf(ConfigError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("reports unknown model identifiers as configuration errors", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));

        const result = await getOpenRouterModelMetadata("test-key", "openai/missing");

        expect(result._unsafeUnwrapErr()).toBeInstanceOf(ConfigError);
        expect(result._unsafeUnwrapErr()).toMatchObject({
            message: "OpenRouter model 'openai/missing' was not found",
        });
    });
});
