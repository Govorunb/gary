import { type Result, ok, err } from "neverthrow";
import z from "zod";
import type { ZodError, core, ZodCatch, ZodDefault } from "zod";
import type { NoUndefined } from ".";

/** This lets us omit the field when constructing from e.g. `zStartup.decode({})`. */
export function zConst<T extends z.core.util.Literal>(value: NonNullable<T>) {
    return z.literal(value).default(value);
}

declare module "zod" {
    interface ZodType {
        fallback(value: core.output<this>): ZodCatch<ZodDefault<this>>;
        sensitive(): this;
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
