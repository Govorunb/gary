import type { JSONSchema, JSONSchemaDefinition } from "openai/lib/jsonschema.mjs";

const SUPPORTED_SCHEMA_KEYWORDS = [
    "additionalProperties",
    "additionalItems",
    "const",
    "default",
    "enum",
    "examples",
    "exclusiveMaximum",
    "exclusiveMinimum",
    "format",
    "items",
    "maxItems",
    "maxLength",
    "maximum",
    "minItems",
    "minLength",
    "minimum",
    "pattern",
    "prefixItems",
    "properties",
    "required",
    "type"
] as const;

// set benched 10-20x better than binary search :(
const KW_SET = new Set<string>(SUPPORTED_SCHEMA_KEYWORDS);

// const-typed set complains if you pass string to has (unlucky)
// so we do a little tomfoolery
function isSupported(key: string): key is (typeof SUPPORTED_SCHEMA_KEYWORDS)[number] {
    return KW_SET.has(key);
}

export function* findUnsupportedSchemaKeywords(obj: JSONSchemaDefinition | null | undefined): Generator<string> {
    if (!obj || typeof obj !== "object") return;

    for (const key in obj) {
        if (!isSupported(key)) {
            yield key;
            // it's not supported, so we don't care to go deeper
            continue;
        }
        // some keys/values allow arbitrary strings and aren't JSON schema keywords - the check must ignore them
        switch (key) {
            case "properties":
                const props = obj[key];
                if (!props || typeof props !== "object") continue;
                for (const prop of Object.values(props)) { // keys are names, not keywords
                    yield* findUnsupportedSchemaKeywords(prop);
                }
                break;
            // enum can contain any 'literal', including objects and arrays!
            // "enum": [0, null, [1,2,3], {"yep, all of these are": "allowed"}]
            case "enum":
            case "const":
            case "default":
            case "type":
            case "examples":
            case "required":
            case "pattern":
            case "format":
                continue;
            
            case "additionalItems":
            case "items":
            case "prefixItems":
                // going across draft versions is... interesting
                // the possible arrangements are:
                //   1. {items}
                //   2. [items] {additionalItems}
                //   3. [prefixItems] {items}
                // where {name} is an object schema applied to all (remaining) elements
                // and [name] is "tuple validation" (ordered)
                const items = (obj as JSONSchema & { prefixItems: JSONSchemaDefinition[] | undefined})[key];
                if (Array.isArray(items)) {
                    for (const item of items) {
                        yield* findUnsupportedSchemaKeywords(item);
                    }
                } else {
                    yield* findUnsupportedSchemaKeywords(items);
                }
                break;
            default:
                const val = obj[key];
                if (val && typeof val === "object") {
                    yield* findUnsupportedSchemaKeywords(val);
                }
        }
    }
}