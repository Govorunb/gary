import { describe, expect, test } from "vitest";
import {
    completionReserve,
    estimateRequestTokens,
    reportedPromptTokens,
    requestByteLength,
} from "./context-window";

describe("context window accounting", () => {
    test("clamps the completion reserve", () => {
        expect(completionReserve(1_024)).toBe(512);
        expect(completionReserve(8_000)).toBe(2_000);
        expect(completionReserve(100_000)).toBe(4_096);
    });

    test("sizes all token-bearing request fields", () => {
        const base = { messages: [{ role: "user" as const, content: "hello" }] };
        const withTools = {
            ...base,
            tools: [{
                type: "function" as const,
                function: {
                    name: "move",
                    parameters: { type: "object", properties: { square: { type: "string" } } },
                },
            }],
        };

        expect(requestByteLength(withTools)).toBeGreaterThan(requestByteLength(base));
        expect(estimateRequestTokens(withTools, 0.5)).toBeGreaterThan(estimateRequestTokens(base, 0.5));
    });

    test("accepts only positive finite prompt usage", () => {
        expect(reportedPromptTokens({ prompt_tokens: 123 })).toBe(123);
        expect(reportedPromptTokens({ prompt_tokens: 0 })).toBeUndefined();
        expect(reportedPromptTokens({ prompt_tokens: "123" })).toBeUndefined();
        expect(reportedPromptTokens(undefined)).toBeUndefined();
    });
});
