import { expect, test } from "vitest";
import { generateFromJsonSchema } from "./json-schema-faker.svelte";

test("generates a new value on each call", async () => {
    const schema = { type: "integer", minimum: 0, maximum: 1_000_000_000 } as const;

    const first = await generateFromJsonSchema(schema);
    const second = await generateFromJsonSchema(schema);

    expect(second).not.toBe(first);
});
