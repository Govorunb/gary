import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ConfigError } from ".";
import { getLMStudioModelMetadata } from "./lm-studio";

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

describe("LM Studio model metadata", () => {
    beforeEach(() => {
        tauriMock.isTauri.mockReset();
        tauriMock.isTauri.mockReturnValue(false);
        tauriMock.fetch.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("uses the loaded context allocation and caches it", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                models: [{
                    key: "gemma-3-270m-it",
                    loaded_instances: [{
                        id: "gemma-3-270m-it",
                        config: { context_length: 8_192 },
                    }],
                }],
            })))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                models: [{
                    key: "gemma-3-270m-it",
                    loaded_instances: [{
                        id: "gemma-3-270m-it",
                        config: { context_length: 16_384 },
                    }],
                }],
            })));
        vi.stubGlobal("fetch", fetchMock);

        const first = await getLMStudioModelMetadata(
            "http://localhost:1235/v1",
            "gemma-3-270m-it",
        );
        const cached = await getLMStudioModelMetadata(
            "http://localhost:1235/v1",
            "gemma-3-270m-it",
        );
        const refreshed = await getLMStudioModelMetadata(
            "http://localhost:1235/v1",
            "gemma-3-270m-it",
            { refresh: true },
        );

        expect(first._unsafeUnwrap()).toStrictEqual({ contextWindow: 8_192 });
        expect(cached._unsafeUnwrap()).toStrictEqual({ contextWindow: 8_192 });
        expect(refreshed._unsafeUnwrap()).toStrictEqual({ contextWindow: 16_384 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:1235/api/v1/models");
    });

    test("requires the model to be loaded", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
            models: [{ key: "gemma-3-270m-it", loaded_instances: [] }],
        }))));

        const result = await getLMStudioModelMetadata(
            "http://localhost:1236/v1",
            "gemma-3-270m-it",
        );

        expect(result._unsafeUnwrapErr()).toBeInstanceOf(ConfigError);
        expect(result._unsafeUnwrapErr()).toMatchObject({
            message: "LM Studio model 'gemma-3-270m-it' is not loaded",
        });
    });
});
