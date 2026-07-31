import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getOllamaModelMetadata } from "./ollama";

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

describe("Ollama model metadata", () => {
    beforeEach(() => {
        tauriMock.isTauri.mockReset();
        tauriMock.isTauri.mockReturnValue(false);
        tauriMock.fetch.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("preloads the model before reading its allocated context", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] })))
            .mockResolvedValueOnce(new Response(JSON.stringify({ done: true })))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                models: [{
                    name: "llama3:latest",
                    model: "llama3:latest",
                    context_length: 4_096,
                }],
            })));
        vi.stubGlobal("fetch", fetchMock);

        const result = await getOllamaModelMetadata(
            "http://localhost:11435/v1",
            "llama3",
        );

        expect(result._unsafeUnwrap()).toStrictEqual({ contextWindow: 4_096 });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls.map(([url]) => url)).toStrictEqual([
            "http://localhost:11435/api/ps",
            "http://localhost:11435/api/generate",
            "http://localhost:11435/api/ps",
        ]);
        expect(fetchMock.mock.calls[1][1]).toMatchObject({
            method: "POST",
            body: JSON.stringify({ model: "llama3", keep_alive: "5m", stream: false }),
        });
    });
});
