type ZodLike = {
    meta?: () => { sensitive?: unknown } | undefined;
    shape?: Record<string, unknown> | (() => Record<string, unknown>);
    unwrap?: () => unknown;
    _def?: Record<string, unknown>;
};

export function hasSensitiveSchemaField(schema: unknown): boolean {
    return hasSensitiveSchemaFieldCore(schema, new Set());
}

function hasSensitiveSchemaFieldCore(schema: unknown, seen: Set<unknown>): boolean {
    if (!isZodLike(schema) || seen.has(schema)) return false;
    seen.add(schema);

    if (schema.meta?.()?.sensitive === true) return true;

    const shape = getShape(schema);
    if (shape && Object.values(shape).some((field) => hasSensitiveSchemaFieldCore(field, seen))) {
        return true;
    }

    return childSchemas(schema).some((child) => hasSensitiveSchemaFieldCore(child, seen));
}

function isZodLike(value: unknown): value is ZodLike {
    return !!value && typeof value === "object" && (
        typeof (value as ZodLike).meta === "function"
        || typeof (value as ZodLike).unwrap === "function"
        || !!(value as ZodLike)._def
    );
}

function getShape(schema: ZodLike): Record<string, unknown> | undefined {
    const shape = schema.shape ?? schema._def?.shape;
    if (typeof shape === "function") return shape();
    if (shape && typeof shape === "object") return shape as Record<string, unknown>;
}

function childSchemas(schema: ZodLike): unknown[] {
    const def = schema._def ?? {};
    const children = [
        safeUnwrap(schema),
        def.innerType,
        def.element,
        def.keyType,
        def.valueType,
        def.in,
        def.out,
        def.left,
        def.right,
        def.catchall,
        ...arrayChildren(def.options),
        ...arrayChildren(def.items),
    ];

    return children.filter((child) => child && child !== schema);
}

function safeUnwrap(schema: ZodLike): unknown {
    try {
        return schema.unwrap?.();
    } catch {
        return undefined;
    }
}

function arrayChildren(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}
