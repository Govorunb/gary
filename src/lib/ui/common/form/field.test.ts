import { describe, expect, test } from "vitest";
import z from "zod";
import "#lib/app/utils/zod.js";
import { fieldInfo } from "./field";

describe("fieldInfo", () => {
    test("reads annotations through wrappers", () => {
        const effort = z.enum(["auto", "none", "high"]).field({ title: "Effort", options: { auto: "Auto (recommended)", none: "None", high: "High" } });
        expect(fieldInfo(effort.fallback("auto"))).toMatchObject({
            kind: "select",
            label: "Effort",
            options: [
                { value: "auto", label: "Auto (recommended)" },
                { value: "none", label: "None" },
                { value: "high", label: "High" },
            ],
        });
        expect(fieldInfo(z.number().min(0).max(1).slider(0.01).fallback(0.2).field({ title: "Chance" })))
            .toMatchObject({ kind: "slider", label: "Chance", min: 0, max: 1, step: 0.01 });
        expect(fieldInfo(z.coerce.number().int().min(1024).max(65535).fallback(8000)))
            .toMatchObject({ kind: "number", min: 1024, max: 65535, step: 1 });
    });

    test("keeps annotations made at different layers", () => {
        expect(fieldInfo(z.number().slider(0.5).optional().field({ title: "Seed", placeholder: "Random" }).field({ description: "Blank for random" })))
            .toMatchObject({ kind: "slider", step: 0.5, placeholder: "Random", label: "Seed", description: "Blank for random" });
    });

    test("derives bounds and requiredness users can act on", () => {
        expect(fieldInfo(z.number().int().optional().field({ placeholder: "Random" })))
            .toMatchObject({ kind: "number", min: undefined, max: undefined, step: 1, placeholder: "Random" });
        expect(fieldInfo(z.number().int().positive())).toMatchObject({ min: 1 });
        expect(fieldInfo(z.string().nonempty())).toMatchObject({ kind: "text", required: true });
        expect(fieldInfo(z.url().default("https://example.com"))).toMatchObject({ kind: "url", required: false });
        expect(fieldInfo(z.string().default("").password())).toMatchObject({ kind: "password" });
    });
});
