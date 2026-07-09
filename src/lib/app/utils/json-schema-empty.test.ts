import { expect, test } from "vitest";
import { emptyValueFromJsonSchema } from "./json-schema-empty";

test("prefers explicit schema values", () => {
    expect(emptyValueFromJsonSchema({ type: "string", default: "saved" })).toBe("saved");
    expect(emptyValueFromJsonSchema({ type: "string", const: "fixed" })).toBe("fixed");
    expect(emptyValueFromJsonSchema({ enum: ["first", "second"] })).toBe("first");
});

test("generates deterministic primitive placeholders", () => {
    expect(emptyValueFromJsonSchema({ type: "string" })).toBe("");
    expect(emptyValueFromJsonSchema({ type: "string", minLength: 3 })).toBe("xxx");
    expect(emptyValueFromJsonSchema({ type: "integer" })).toBe(0);
    expect(emptyValueFromJsonSchema({ type: "number", minimum: 5 })).toBe(5);
    expect(emptyValueFromJsonSchema({ type: "integer", minimum: 5, multipleOf: 2 })).toBe(6);
    expect(emptyValueFromJsonSchema({ type: "integer", maximum: -5, multipleOf: 2 })).toBe(-6);
    expect(emptyValueFromJsonSchema({ type: "number", exclusiveMinimum: 1 })).toBeGreaterThan(1);
    expect(emptyValueFromJsonSchema({ type: "number", exclusiveMaximum: -1 })).toBeLessThan(-1);
    expect(emptyValueFromJsonSchema({ type: "boolean" })).toBe(false);
    expect(emptyValueFromJsonSchema({ type: "null" })).toBe(null);
});

test("includes required object properties only", () => {
    expect(emptyValueFromJsonSchema({
        type: "object",
        properties: {
            required_prop: { type: "string" },
            optional_prop: { type: "string" },
            nested: {
                type: "object",
                properties: {
                    value: { const: null },
                    optional: { type: "number" },
                },
                required: ["value"],
            },
        },
        required: ["required_prop", "nested"],
    })).toEqual({
        required_prop: "",
        nested: { value: null },
    });
});

test("generates empty arrays unless minItems requires sample entries", () => {
    expect(emptyValueFromJsonSchema({
        type: "array",
        items: { enum: ["item"] },
    })).toEqual([]);

    expect(emptyValueFromJsonSchema({
        type: "array",
        items: { type: "object", properties: { value: { type: "integer" } }, required: ["value"] },
        minItems: 2,
    })).toEqual([{ value: 0 }, { value: 0 }]);

    expect(emptyValueFromJsonSchema({
        type: "array",
        items: { enum: ["first", "second"] },
        minItems: 2,
        uniqueItems: true,
    })).toEqual(["first", "second"]);
});

test("handles simple composition deterministically", () => {
    expect(emptyValueFromJsonSchema({
        oneOf: [{ type: "string", default: "chosen" }, { type: "number" }],
    })).toBe("chosen");

    expect(emptyValueFromJsonSchema({
        anyOf: [{ type: "boolean" }, { type: "string" }],
    })).toBe(false);

    expect(emptyValueFromJsonSchema({
        allOf: [
            { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
            { properties: { b: { const: true } }, required: ["b"] },
        ],
    })).toEqual({ a: "", b: true });
});
