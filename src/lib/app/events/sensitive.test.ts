import { describe, expect, test } from "vitest";
import z from "zod";
import "../utils/zod";
import { hasSensitiveSchemaField } from "./sensitive";

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
