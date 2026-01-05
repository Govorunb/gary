import type { Attachment } from "svelte/attachments";
import z, { type core, type ZodCatch, type ZodDefault } from "zod";
import { ok, err, type Result, ResultAsync } from "neverthrow";
import { invoke, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import { on } from "svelte/events";
import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";
import r from "./reporting";
import type { Dayjs } from "dayjs";
// import { isTauri } from "@tauri-apps/api/core";

export function pickRandom<T>(arr: T[]) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function isWebkitGtk() {
    return navigator.platform.includes("Linux"); // && isTauri();
}

export const tauriWebkitScrollNum: Attachment<HTMLInputElement> = (el) => {
    if (el.type !== "number" && el.type !== "range") {
        r.warn("webkitScrollNum should only be attached to inputs of type 'number' or 'range'");
        el.style.border = "1px red dotted";
        return;
    }
    // on linux, tauri uses libwebkit2gtk, which is just kinda generally weird and offputting
    if (!isWebkitGtk()) return;
    
    const listener = (evt: WheelEvent) => {
        const target = evt.target as HTMLInputElement;
        // increment/decrement on scroll
        if (target.disabled) return;
        if (evt.deltaY === 0) return;
        evt.preventDefault(); // in case the browser has its own input scroll
        evt.deltaY < 0 ? target.stepUp() : target.stepDown();
        target.dispatchEvent(new Event("input")); // svelte 5 targets 'input' and not 'change'
    };
    return on(el, "wheel", listener);
};

export function preventDefault<T, E extends Event, F extends (evt: E, ...args: any[]) => T>(func: F) {
    const f = (evt: E, ...args: any[]) => {
        evt.preventDefault();
        return func(evt, ...args);
    };
    return f as F;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** This lets us omit the field when constructing from e.g. `zStartup.decode({})`. */
export function zConst<T extends z.core.util.Literal>(value: NonNullable<T>) {
    return z.literal(value).default(value);
}

export type NoUndefined<T> = T extends undefined ? never : T;

export function zFallback<T extends z.ZodType>(schema: T, value: NoUndefined<core.output<T>>): ZodCatch<ZodDefault<T>> {
    return schema.default(value).catch(value);
}

declare module "zod" {
    interface ZodType {
        fallback(value: core.output<this>): ZodCatch<ZodDefault<this>>;
    }
}
z.ZodType.prototype.fallback = function<T extends z.ZodType>(value: T) {
    return zFallback(this, value);
}

export function shortId() {
    return Math.random().toString(36).substring(2);
}

export function parseError<E extends Error>(e: E): E;
export function parseError(e: unknown): Error;
export function parseError(e: unknown): Error {
    if (e instanceof Error) return e;
    const stringed = e?.toString?.();
    if (stringed === "[object Object]") {
        return new Error(JSON.stringify(e));
    }
    return new Error(stringed);
}

export function jsonParse(s: string): Result<any, Error> {
    try {
        return ok(JSON.parse(s));
    } catch (e: unknown) {
        return err(parseError(e));
    }
}

export function safeInvoke<TRet = void>(cmd: string, args?: InvokeArgs, options?: InvokeOptions): ResultAsync<TRet, string> {
    return ResultAsync.fromPromise(invoke(cmd, args, options), s => s as string);
}

declare module "neverthrow" {
    interface ResultAsync<T, E> {
        finally(fn: () => void): ResultAsync<T, E>;
    }
}
ResultAsync.prototype.finally = function <T, E>(fn: () => void): ResultAsync<T, E> {
    return this.andTee(fn).orTee(fn);
};

export function safeParse<T>(z: z.ZodType<T>, o: unknown): Result<T, z.ZodError<T>> {
    const res = z.safeParse(o);
    if (res.success) {
        return ok(res.data);
    }
    return err(res.error);
}

export const horizontalScroll: Attachment<HTMLElement> = (el) => {
    return on(el, "wheel", (evt: WheelEvent) => {
        evt.preventDefault();
        el.scrollLeft += evt.deltaY;
    });
};

/**
 * Format a number to at least the precision of the step.
 * 
 * Examples:
 * - `(0.5, 0.01)` -> `"0.50"`
 * - `(1234, 10)` -> `"1234"`
 * - `(1234, 0.00001)` -> `"1234.00000"`
 * - `(1234.000001, 10)` -> `"1234.000001"`
 * - `(-567, 10)` -> `"-567"`
 * - `(-567, 0.01)` -> `"-567.00"`
 */
export function toStepPrecision(value: number, step: number): string {
    if (!Number.isFinite(value) || !(step > 0 && step < 1)) {
        return String(value);
    }

    const stepFractionDigits = clamp(Math.ceil(-Math.log10(Math.abs(step))), 0, 20);
    if (stepFractionDigits === 0) return value.toString();
    
    const valDigits = value === 0 ? 0 : -Math.floor(Math.log10(Math.abs(value)));
    if (valDigits > stepFractionDigits) return value.toString(); // already more precise than required

    return value.toFixed(stepFractionDigits);
}

export type Awaitable<T = void> = T | Promise<T>;

export async function listenSub<T>(evt: string, fn: EventCallback<T>, subscriptions: UnlistenFn[]): Promise<UnlistenFn> {
    const unsub = await listen(evt, fn);
    subscriptions.push(unsub);
    return unsub;
}

export function tooltip(text: string): Attachment<HTMLElement> {
    return (el) => {
        el.setAttribute("title", text);
        el.setAttribute("aria-label", text);
    }
}

export const CHARS_PER_TOKEN = 4; // TODO: may not actually hold with excessive json content

export function estimateTokens(text: string) {
    return text.length * CHARS_PER_TOKEN;
}

// @ts-expect-error
export const APP_VERSION: string = __APP_VERSION__;

export function clearLocalStorage() {
    const warning = "Proceeding will DELETE your saved preferences, resetting the app.\n\nThere will be no going back.";
    if (!confirm(warning)) return;

    localStorage.clear();
    location.reload();
}

declare global {
    interface String {
        reverse(): string;
    }
}
String.prototype.reverse = function() {
    return [...this].reverse().join("")
};

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            return reject(new Error("Aborted"));
        }
        
        const timeout = setTimeout(resolve, ms);
        
        signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error("Aborted"));
        }, { once: true });
    });
}

/**
 * Convert callback-based event streams into async generators.
 *
 * The `setup` callback receives `next` and `done` functions which you use to register your event handlers.
 * Call `next(value)` to push values into the stream. Call `done()` to signal termination.
 *
 * ```ts
 * const stream = createListener<string>((next, done) => {
 *     socket.onmessage = (e) => next(e.data);
 *     socket.onclose = () => done();
 * });
 * for await (const msg of stream) {
 *     console.log(msg);
 * }
 * ```
 *
 * Values are buffered if the generator isn't currently awaiting (e.g. in reentrant calls).
 * After `done()` is called, further `next()` calls are ignored.
 */
export async function* createListener<T>(setup: (next: (value: T) => void, done: () => void) => void): AsyncGenerator<T> {
    const DONE = Symbol("done");
    type QueueValue = T | typeof DONE;
    type Resolve = (value: QueueValue) => void;

    const queue: QueueValue[] = [];
    let resolve: Resolve | null = null;

    const tryResolve = () => {
        if (!resolve || !queue.length) return;
        
        const value = queue.shift()!;
        // reentry (just in case)
        const r = resolve;
        resolve = null;
        r(value);
    };

    setup(
        (value) => { queue.push(value); tryResolve(); },
        () => { queue.push(DONE); tryResolve(); }
    );

    while (true) {
        const value: QueueValue
            = queue.length ? queue.shift()!
            : await new Promise<QueueValue>(r => resolve = r);

        if (value === DONE) break;
        yield value;
    }
}

// you're telling me not a single programmer in the history of programming ever needed this
export function localeTimeWithMs(d: Dayjs): string {
    const time = d.format('LTS');
    const ms = d.format('SSS');

    return time.endsWith('M') ? // 12-hour
        time.replace(/(\s*[AP]M)$/i, `.${ms}$1`)
        : `${time}.${ms}`;
}
