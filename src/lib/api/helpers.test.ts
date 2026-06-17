import { describe, expect, test } from "vitest";

import { findUnsupportedSchemaKeywords } from "./helpers";

describe("findUnsupportedSchemaKeywords", () => {
    test("ignores schema annotation keywords", () => {
        expect(Array.from(findUnsupportedSchemaKeywords({
            type: "object",
            title: "Action schema",
            description: "Schema metadata is not a validation constraint.",
            properties: {
                foo: {
                    type: "string",
                    title: "Foo",
                    description: "Helpful context for the model.",
                },
            },
            additionalProperties: false,
        }))).toStrictEqual([]);
    });
});
