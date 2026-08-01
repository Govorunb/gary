import { createGenerator, type JsonSchema } from "json-schema-faker";

export function createJsonSchemaGenerator(seed = Date.now()) {
    const generator = createGenerator({ seed });

    return {
        generate(schema: JsonSchema): Promise<unknown> {
            return generator.generate($state.snapshot(schema) as JsonSchema);
        },
    };
}

const generator = createJsonSchemaGenerator();

export function generateFromJsonSchema(schema: JsonSchema): Promise<unknown> {
    return generator.generate(schema);
}
