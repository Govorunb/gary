import { createGenerator, type JsonSchema } from "json-schema-faker";

const generator = createGenerator();

export function generateFromJsonSchema(schema: JsonSchema): Promise<unknown> {
    return generator.generate($state.snapshot(schema) as JsonSchema);
}
