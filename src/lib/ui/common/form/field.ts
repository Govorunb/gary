import z from "zod";
import type { Snippet } from "svelte";

export type FieldKind = "boolean" | "select" | "number" | "slider" | "text" | "url" | "password";
export type FieldInfo = ReturnType<typeof fieldInfo>;

/** What `Field` hands the component for each kind. */
export type ControlProps<V> = {
    field: FieldInfo;
    id: string;
    value?: V;
    help: string | Snippet;
    disabled: boolean;
    /** Settings dialog layout: help is a teaching tip beside the label. */
    tip: boolean;
};

type FieldJsonSchema = z.core.JSONSchema.BaseSchema & z.GlobalMeta;

/** What a form control needs to know about a field, read from its schema and its `.field()` annotations.
 * Annotations may sit under `.fallback()`/`.optional()` wrappers, so read them through `toJSONSchema`, not `schema.meta()`. */
export function fieldInfo(schema: z.ZodType) {
    const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as FieldJsonSchema;
    const hints = json._gary_field ?? {};
    const integer = json.type === "integer";
    // `.positive()` on an int means at least 1
    const exclusiveMin = integer && typeof json.exclusiveMinimum === "number" ? json.exclusiveMinimum + 1 : undefined;
    const options = (json.enum ?? []).map(value => String(value));
    return {
        kind: hints.widget ?? fieldKind(json),
        label: json.title ?? "",
        description: json.description ?? "",
        placeholder: hints.placeholder ?? "",
        required: (json.minLength ?? 0) > 0,
        min: bound(json.minimum ?? exclusiveMin),
        max: bound(json.maximum),
        step: hints.step ?? (integer ? 1 : undefined),
        options: options.map(value => ({ value, label: hints.options?.[value] ?? value })),
    };
}

function fieldKind(json: FieldJsonSchema): FieldKind {
    if (json.type === "boolean") return "boolean";
    if (json.enum) return "select";
    if (json.type === "number" || json.type === "integer") return "number";
    if (json.format === "uri") return "url";
    return "text";
}

/** zod reports the safe-integer range for any int; that's no bound at all to a user. */
function bound(value: number | undefined) {
    return value !== undefined && Math.abs(value) < Number.MAX_SAFE_INTEGER ? value : undefined;
}
