import { describe, expect, test } from "vitest";
import z from "zod";
import "../utils/zod";
import { hasSensitiveSchemaField, redactSensitiveData } from "./sensitive";

describe("hasSensitiveSchemaField", () => {
    test("detects top-level sensitive fields", () => {
        const schema = z.object({
            params: z.any().sensitive(),
        });

        expect(hasSensitiveSchemaField(schema)).toBe(true);
    });

    test("detects nested sensitive fields", () => {
        const schema = z.object({
            outer: z.object({
                token: z.string().sensitive(),
            }),
        });

        expect(hasSensitiveSchemaField(schema)).toBe(true);
    });

    test("detects sensitive fields behind wrappers", () => {
        const schema = z.object({
            secret: z.string().sensitive().optional().default(""),
        });

        expect(hasSensitiveSchemaField(schema)).toBe(true);
    });

    test("returns false when no fields are sensitive", () => {
        const schema = z.object({
            id: z.string(),
            nested: z.object({
                value: z.number(),
            }),
        });

        expect(hasSensitiveSchemaField(schema)).toBe(false);
    });

    test("returns false for non-zod typed schemas", () => {
        expect(hasSensitiveSchemaField({} as { token: string })).toBe(false);
        expect(hasSensitiveSchemaField(null)).toBe(false);
        expect(hasSensitiveSchemaField(undefined)).toBe(false);
    });
});

describe("redactSensitiveData", () => {
    test("redacts top-level sensitive strings", () => {
        const schema = z.object({
            apiKey: z.string().sensitive(),
            label: z.string(),
        });

        expect(redactSensitiveData(schema, {
            apiKey: "sk-secret",
            label: "OpenAI",
        })).toEqual({
            apiKey: "[REDACTED_STRING]",
            label: "OpenAI",
        });
    });

    test("redacts nested sensitive fields", () => {
        const schema = z.object({
            outer: z.object({
                token: z.string().sensitive(),
                id: z.string(),
            }),
        });

        expect(redactSensitiveData(schema, {
            outer: {
                token: "secret",
                id: "public",
            },
        })).toEqual({
            outer: {
                token: "[REDACTED_STRING]",
                id: "public",
            },
        });
    });

    test("redacts sensitive fields behind wrappers", () => {
        const schema = z.object({
            secret: z.string().sensitive().optional().default(""),
            visible: z.string(),
        });

        expect(redactSensitiveData(schema, {
            secret: "wrapped",
            visible: "safe",
        })).toEqual({
            secret: "[REDACTED_STRING]",
            visible: "safe",
        });
    });

    test("uses value-kind placeholders for sensitive objects and arrays", () => {
        const schema = z.object({
            params: z.object({ token: z.string() }).sensitive(),
            messages: z.array(z.string()).sensitive(),
            count: z.number().sensitive(),
        });

        expect(redactSensitiveData(schema, {
            params: { token: "secret" },
            messages: ["secret"],
            count: 1,
        })).toEqual({
            params: "[REDACTED_OBJECT]",
            messages: "[REDACTED_ARRAY]",
            count: "[REDACTED_VALUE]",
        });
    });

    test("redacts sensitive fields inside array items", () => {
        const schema = z.object({
            calls: z.array(z.object({
                name: z.string(),
                response: z.any().sensitive(),
            })),
        });

        expect(redactSensitiveData(schema, {
            calls: [
                { name: "first", response: { content: "secret" } },
                { name: "second", response: "secret" },
            ],
        })).toEqual({
            calls: [
                { name: "first", response: "[REDACTED_OBJECT]" },
                { name: "second", response: "[REDACTED_STRING]" },
            ],
        });
    });

    test("returns non-zod typed data unchanged", () => {
        const data = { token: "secret" };

        expect(redactSensitiveData({} as { token: string }, data)).toBe(data);
        expect(redactSensitiveData(null, data)).toBe(data);
        expect(redactSensitiveData(undefined, data)).toBe(data);
    });
});
