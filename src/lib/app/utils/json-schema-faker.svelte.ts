import { generate, type JsonSchema } from "json-schema-faker";

export function generateFromJsonSchema(schema: JsonSchema): Promise<unknown> {
    return generate($state.snapshot(schema) as JsonSchema);
}
