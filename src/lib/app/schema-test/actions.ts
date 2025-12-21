import type * as v1 from "$lib/api/v1/spec";

export const TEST_ACTIONS: v1.Action[] = [
    {
        name: "prim_str",
        description: "Freeform string.",
        schema: { "type": "string" },
    },
    {
        name: "prim_int",
        description: "Freeform integer.",
        schema: { "type": "integer" },
    },
    {
        name: "prim_bool",
        description: "Freeform boolean.",
        schema: { "type": "boolean" },
    },
    {
        name: "prim_null",
        description: "Null type.",
        schema: { "type": "null" },
    },
    {
        name: "enum_null",
        description: "The illusion of free choice.",
        schema: { "enum": [null] },
    },
    {
        name: "const_null",
        description: "Constant null.",
        schema: { "const": null },
    },
    {
        name: "const_str",
        description: "Constant string.",
        schema: { "const": "Hello!" },
    },
    {
        name: "array_empty",
        description: "Must be an array.",
        schema: { "type": "array", "items": { "enum": [null] } },
    },
    {
        name: "array_unique",
        description: "Array with unique constraint.",
        schema: {
            "type": "array",
            "items": { "enum": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"] },
            "minItems": 2,
            "maxItems": 4,
            "uniqueItems": true,
        },
    },
    {
        name: "obj",
        description: "Simple object.",
        schema: {
            "type": "object",
            "properties": {
                "str_prop": { "type": "string" },
                "int_prop": { "type": "integer" },
                "null_prop": { "enum": [null] },
            },
            "required": ["str_prop", "int_prop", "null_prop"],
        },
    },
    {
        name: "complex_obj",
        description: "Object with nested primitives, arrays, and other objects.",
        schema: {
            "type": "object",
            "properties": {
                "str_prop": { "type": "string" },
                "int_prop": { "type": "integer" },
                "null_prop": { "enum": [null] },
                "arr_prop": {
                    "type": "array",
                    "items": { "enum": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"] },
                    "minItems": 2,
                    "maxItems": 4,
                    "uniqueItems": true,
                },
                "obj_prop": {
                    "type": "object",
                    "properties": {
                        "str_prop": { "type": "string" },
                        "int_prop": { "type": "integer" },
                        "null_prop": { "enum": [null] },
                        "arr_prop": {
                            "type": "array",
                            "items": { "enum": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"] },
                            "minItems": 2,
                            "maxItems": 4,
                            "uniqueItems": true,
                        },
                        "obj_prop": {
                            "type": "object",
                            "properties": {},
                            "required": [],
                        },
                    },
                    "required": ["str_prop", "int_prop", "null_prop", "arr_prop", "obj_prop"],
                },
            },
            "required": ["str_prop", "int_prop", "null_prop", "arr_prop", "obj_prop"],
        },
    },
    {
        name: "array_of_obj",
        description: "Array of objects.",
        schema: {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "str_prop": { "type": "string" },
                    "int_prop": { "type": "integer" },
                },
                "required": ["str_prop", "int_prop"],
            },
            "minItems": 2,
            "maxItems": 4,
            "uniqueItems": true,
        },
    },
    {
        name: "enum_primitive",
        description: "Enum with primitive members.",
        schema: {
            "enum": ["string", 42, true],
        },
    },
    {
        name: "enum_obj",
        description: "Enum with object members.",
        schema: {
            "enum": [{ "str_prop": "string" }, { "int_prop": 42 }, { "null_prop": null }],
        },
    },
    {
        name: "str_extra",
        description: "Extra properties for strings.",
        schema: {
            "type": "object",
            "properties": {
                "freeform": { "type": "string" },
                "bounds": {
                    "type": "string",
                    "minLength": 5,
                    "maxLength": 10,
                },
                "pattern": { "type": "string", "pattern": "^[a-z]+$" },
                "format-datetime": { "type": "string", "format": "date-time" },
                "format-date": { "type": "string", "format": "date" },
                "format-time": { "type": "string", "format": "time" },
                "format-uri": { "type": "string", "format": "uri" },
            },
            "required": ["freeform", "bounds", "pattern", "format-datetime", "format-date", "format-time", "format-uri"],
        },
    },
    {
        name: "num_extra",
        description: "Extra properties for numbers.",
        schema: {
            "type": "object",
            "properties": {
                "freeform": { "type": "number" },
                "bounds-inclusive": {
                    "type": "number",
                    "minimum": 5,
                    "maximum": 10,
                },
                "bounds-exclusive": {
                    "type": "number",
                    "exclusiveMinimum": 5,
                    "exclusiveMaximum": 10,
                },
                "integer": { "type": "integer" },
                "int-step": {
                    "type": "integer",
                    "multipleOf": 2,
                },
                "float-step": {
                    "type": "number",
                    "multipleOf": 0.5,
                },
            },
            "required": ["freeform", "bounds-inclusive", "bounds-exclusive", "integer", "int-step", "float-step"],
        },
    },
    {
        name: "mean_test",
        description: "Mean test for backends and frontends. Don't worry if this doesn't pass.",
        schema: {
            "type": "object",
            "properties": {
                "oneOf": {
                    "enum": [
                        {
                            "$ref": null,
                            "type": "object",
                            "properties": {
                                "anyOf": { "type": "null" },
                                "null": { "type": "boolean" },
                                "<lr>hello loguru users</>": "<test><lr>ABCDE</>\n<pre>And now, for something completely JSON.parse: \"\\\"</pre>\\",
                            },
                            "exclusiveMinimum": true,
                            "additionalProperties": true,
                            "required": ["invisible_man"],
                        }
                    ],
                },
                "py jsf bug #1e5e9": { "type": "integer", "maximum": -1 },
                "randy killer (js jsf)": {
                    "type": "object",
                    "properties": {
                        "1": { "type": "number", "multipleOf": 0.5 },
                        "2": { "type": "number", "exclusiveMinimum": 5, "exclusiveMaximum": 10 },
                    },
                    "required": ["1", "2"],
                },
                "": { "type": "integer", "minimum": 10000.5 },
            },
            "required": ["oneOf", "py jsf bug #1e5e9", "randy killer (js jsf)", ""],
        },
    },
    {
        name: "no_schema",
        description: "Action without schema.",
        schema: null,
    },
    {
        name: "<b>html_inject</b>",
        description: "<i>Test HTML injection.</i>",
        schema: {
            "type": "object",
            "properties": {
                "<u>underline</u>": {
                    "type": "string",
                    "default": "<marquee>test</marquee>",
                },
            },
            "required": ["<u>underline</u>"],
        },
    },
    {
        name: "schema_update",
        description: "On first execution, the schema of this action will change.",
        schema: { "type": "boolean" },
    },
    {
        name: "optional_props",
        description: "Test optional properties.",
        schema: {
            "type": "object",
            "properties": {
                "optional_prop": { "type": "string" },
                "required_prop": { "type": "string" },
                "optional_obj": {
                    "type": "object",
                    "properties": {
                        "str_prop": { "type": "string" },
                        "int_prop": { "type": "integer" },
                        "null_prop": { "const": null },
                    },
                    "required": ["null_prop"],
                },
            },
            "required": ["required_prop"],
        },
    },
    {
        name: "negative_numbers",
        description: "Test negative numbers.",
        schema: {
            "type": "object",
            "properties": {
                "constrained_int": { "type": "integer", "minimum": -1000, "maximum": -1 },
                "constrained_float": { "type": "number", "minimum": -1000, "maximum": -1, "multipleOf": 0.1 },
                "free_int_negative": { "type": "integer" },
                "free_float_negative": { "type": "number" },
                "free_int_positive": { "type": "integer" },
                "free_float_positive": { "type": "number" },
            },
            "required": [
                "constrained_int", "constrained_float",
                "free_int_negative", "free_float_negative",
                "free_int_positive", "free_float_positive",
            ],
        },
    },
];

// the test is so mean it breaks inference providers...
const excluded: string[] = ["mean_test"];
// const excluded: string[] = [];
export const TEST_ACTIONS_MAP = new Map(
    TEST_ACTIONS
        .filter(a => !excluded.includes(a.name))
        .map(action => [action.name, action])
);
