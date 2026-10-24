import { type Result, ok, err } from "neverthrow";
import z from "zod";
import type { ZodError, core, ZodCatch, ZodDefault } from "zod";
import type { NoUndefined } from ".";

/** This lets us omit the field when constructing from e.g. `zStartup.decode({})`. */
export function zConst<T extends z.core.util.Literal>(value: NonNullable<T>) {
    return z.literal(value).default(value);
}

/** How a settings form presents a field, beyond its standard `title` and `description`. */
export type FieldHints = {
    placeholder?: string;
    step?: number;
    /** Display label for each enum value. */
    options?: Record<string, string>;
    /** Only where the type's default control doesn't fit. */
    widget?: "slider" | "password";
};

/** Labels for every value of a string enum; other types take none. */
type OptionLabels<T> = [T] extends [string] ? (string extends T ? unknown : { options?: Record<T, string> }) : unknown;
type FieldCopy<T> = { title?: string; description?: string; placeholder?: string } & OptionLabels<NonNullable<T>>;

declare module "zod" {
    interface ZodType {
        fallback(value: core.output<this>): ZodCatch<ZodDefault<this>>;
        sensitive(): this;
        /** Label, help text and hints for settings forms (`Field.svelte`). */
        field(copy: FieldCopy<core.output<this>>): this;
        slider<S extends ZodType<number | null | undefined, any>>(this: S, step: number): S;
        password<S extends ZodType<string | null | undefined, any>>(this: S): S;
    }
    interface GlobalMeta {
        sensitive?: boolean;
        _gary_field?: FieldHints;
    }
}
z.ZodType.prototype.fallback = function<T extends z.ZodType>(this: T, value: NoUndefined<core.output<T>>): ZodCatch<ZodDefault<T>> {
    return this.default(value).catch(value);
}

export function safeParse<T>(z: z.ZodType<T>, o: unknown): Result<T, z.ZodError<T>> {
    const res = z.safeParse(o);
    if (res.success) {
        return ok(res.data);
    }
    return err(res.error);
}

export function formatZodError<E extends ZodError>(e: E) {
    return e.issues.map(i => `${i.path.join('.') || "(root)"}: ${i.message}`);
}

z.ZodType.prototype.sensitive = function<T extends z.ZodType>(this: T): T {
    return this.meta({sensitive: true});
}

z.ZodType.prototype.field = function(this: z.ZodType, { title, description, ...hints }: FieldCopy<unknown> & FieldHints) {
    // An unset key here would blank the copy of a layer this one wraps.
    const copy = Object.fromEntries(Object.entries({ title, description }).filter(([, v]) => v !== undefined));
    return Object.keys(hints).length ? withHints(this.meta(copy), hints) : this.meta(copy);
}
z.ZodType.prototype.slider = function<S extends z.ZodType>(this: S, step: number): S {
    return withHints(this, { widget: "slider", step });
}
z.ZodType.prototype.password = function<S extends z.ZodType>(this: S): S {
    return withHints(this, { widget: "password" });
}

/** zod replaces a wrapper's `_gary_field` wholesale, so each write carries the hints of the layers it wraps. */
function withHints<S extends z.ZodType>(schema: S, hints: FieldHints): S {
    return schema.meta({ _gary_field: { ...existingHints(schema), ...hints } });
}

function existingHints(schema: z.ZodType): FieldHints {
    const inner = (schema.def as { innerType?: z.ZodType }).innerType;
    return { ...(inner && existingHints(inner)), ...schema.meta()?._gary_field };
}

export type UnwrapZod<T> = T extends z.ZodType ? z.infer<T> : T;
