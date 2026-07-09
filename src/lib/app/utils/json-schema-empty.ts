import type { JsonSchema } from "json-schema-faker";

const JSON_SCHEMA_TYPES = ["object", "array", "string", "integer", "number", "boolean", "null"] as const;
type JsonSchemaType = typeof JSON_SCHEMA_TYPES[number];
type JsonSchemaObject = Exclude<JsonSchema, boolean>;

export function emptyValueFromJsonSchema(schema: JsonSchema): unknown {
    return emptyValue(schema);
}

function emptyValue(schema: JsonSchema): unknown {
    if (typeof schema === "boolean") {
        return null;
    }

    if (hasOwn(schema, "default")) {
        return cloneValue(schema.default);
    }

    if (hasOwn(schema, "const")) {
        return cloneValue(schema.const);
    }

    if (schema.enum?.length) {
        return cloneValue(schema.enum[0]);
    }

    if (schema.allOf?.length) {
        return emptyValue(mergeAllOf(schema));
    }

    if (schema.oneOf?.length) {
        return emptyValue(schema.oneOf[0]);
    }

    if (schema.anyOf?.length) {
        return emptyValue(schema.anyOf[0]);
    }

    switch (inferType(schema)) {
        case "object":
            return emptyObject(schema);
        case "array":
            return emptyArray(schema);
        case "integer":
            return emptyNumber(schema, true);
        case "number":
            return emptyNumber(schema, false);
        case "boolean":
            return false;
        case "null":
            return null;
        default:
            return emptyString(schema);
    }
}

function emptyObject(schema: JsonSchemaObject): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const properties = schema.properties ?? {};

    for (const key of schema.required ?? []) {
        result[key] = emptyValue(properties[key] ?? true);
    }

    return result;
}

function emptyArray(schema: JsonSchemaObject): unknown[] {
    const length = Math.max(0, schema.minItems ?? 0);
    const itemSchema = schema.items ?? schema.prefixItems?.[0] ?? true;

    if (
        schema.uniqueItems
        && typeof itemSchema === "object"
        && Array.isArray(itemSchema.enum)
    ) {
        return itemSchema.enum.slice(0, length).map(cloneValue);
    }

    return Array.from({ length }, (_, index) => emptyValue(schema.prefixItems?.[index] ?? itemSchema));
}

function emptyString(schema: JsonSchemaObject): string {
    if (schema.format === "date-time") return "1970-01-01T00:00:00.000Z";
    if (schema.format === "date") return "1970-01-01";
    if (schema.format === "time") return "00:00:00";
    if (schema.format === "uri") return "https://example.com";

    return "x".repeat(schema.minLength ?? 0);
}

function emptyNumber(schema: JsonSchemaObject, integer: boolean): number {
    const multipleOf = schema.multipleOf;

    if (schema.minimum !== undefined && schema.minimum > 0) {
        return alignNumber(schema.minimum, schema, integer, "up");
    }

    if (schema.exclusiveMinimum !== undefined && schema.exclusiveMinimum >= 0) {
        const step = multipleOf ?? (integer ? 1 : numberStep(schema.exclusiveMinimum));
        return alignNumber(schema.exclusiveMinimum + step, schema, integer, "up");
    }

    if (schema.maximum !== undefined && schema.maximum < 0) {
        return alignNumber(schema.maximum, schema, integer, "down");
    }

    if (schema.exclusiveMaximum !== undefined && schema.exclusiveMaximum <= 0) {
        const step = multipleOf ?? (integer ? 1 : numberStep(schema.exclusiveMaximum));
        return alignNumber(schema.exclusiveMaximum - step, schema, integer, "down");
    }

    return 0;
}

function numberStep(value: number) {
    return Math.max(Number.MIN_VALUE, Math.abs(value) * Number.EPSILON);
}

function alignNumber(value: number, schema: JsonSchemaObject, integer: boolean, direction: "up" | "down") {
    let next = integer ? direction === "up" ? Math.ceil(value) : Math.floor(value) : value;
    const multipleOf = schema.multipleOf;

    if (multipleOf && multipleOf > 0) {
        const quotient = next / multipleOf;
        next = multipleOf * (direction === "up" ? Math.ceil(quotient) : Math.floor(quotient));
    }

    if (integer) {
        next = direction === "up" ? Math.ceil(next) : Math.floor(next);
    }

    return Object.is(next, -0) ? 0 : next;
}

function inferType(schema: JsonSchemaObject): JsonSchemaType {
    if (typeof schema.type === "string" && isJsonSchemaType(schema.type)) {
        return schema.type;
    }

    if (Array.isArray(schema.type)) {
        const type = schema.type.find(isJsonSchemaType);
        if (type) return type;
    }

    if (schema.properties || schema.required || schema.additionalProperties !== undefined || schema.patternProperties) {
        return "object";
    }

    if (schema.items || schema.prefixItems || schema.minItems !== undefined || schema.maxItems !== undefined) {
        return "array";
    }

    if (
        schema.minimum !== undefined ||
        schema.maximum !== undefined ||
        schema.exclusiveMinimum !== undefined ||
        schema.exclusiveMaximum !== undefined ||
        schema.multipleOf !== undefined
    ) {
        return "number";
    }

    if (schema.minLength !== undefined || schema.maxLength !== undefined || schema.pattern || schema.format) {
        return "string";
    }

    return "null";
}

function mergeAllOf(schema: JsonSchemaObject): JsonSchemaObject {
    const merged: JsonSchemaObject = { ...schema, allOf: undefined };

    for (const next of schema.allOf ?? []) {
        if (typeof next === "boolean") continue;

        const properties = { ...merged.properties, ...next.properties };
        const required = [...new Set([...(merged.required ?? []), ...(next.required ?? [])])];
        Object.assign(merged, next, { properties, required });
    }

    return merged;
}

function hasOwn<T extends object>(obj: T, key: PropertyKey): key is keyof T {
    return Object.hasOwn(obj, key);
}

function isJsonSchemaType(type: string): type is JsonSchemaType {
    return JSON_SCHEMA_TYPES.includes(type as JsonSchemaType);
}

function cloneValue<T>(value: T): T {
    if (value === undefined) return value;
    return structuredClone(value);
}
