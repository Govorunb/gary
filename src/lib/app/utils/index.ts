import type { Attachment } from "svelte/attachments";
import z, { type ZodError, type core, type ZodCatch, type ZodDefault } from "zod";
import { ok, err, ResultAsync, type Result, Ok, Err } from "neverthrow";
import { invoke, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import { on } from "svelte/events";
import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";
import r from "./reporting";
import type { Dayjs } from "dayjs";
import { dev } from "$app/environment";
// import { isTauri } from "@tauri-apps/api/core";

export function pickRandom<T>(arr: T[]) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// on linux, tauri uses libwebkit2gtk, which is just kinda generally weird and offputting
export function isWebkitGtk() {
    return navigator.platform.includes("Linux") && navigator.vendor.includes("Apple");
}

export const scrollNumInput: Attachment<HTMLInputElement> = (el) => {
    if (el.type !== "number" && el.type !== "range") {
        r.warn("scrollNumInput should only be attached to inputs of type 'number' or 'range'");
        el.style.border = "1px red dotted";
        return;
    }
    // browser vendors are so funny
    // on chromium you have to "opt in" with a 'wheel' listener
    // (awp you should just do the scrolling yourself inside the listener - obviating the browser implementation)
    // what a big brain big man big beefy brain man move
    // (also on cr it only scrolls when focused to prevent "randomly" hijacking page scroll - we don't care, our page doesn't scroll)
    //if (!isWebkitGtk()) return on(el, "wheel", () => {});

    const listener = (evt: WheelEvent) => {
        const target = evt.target as HTMLInputElement;
        // increment/decrement on scroll
        if (target.disabled) return;
        if (evt.deltaY === 0) return;
        evt.preventDefault(); // in case the browser has its own input scroll
        evt.deltaY < 0 ? target.stepUp() : target.stepDown();
        target.dispatchEvent(new Event("input")); // svelte 5 targets 'input' and not 'change'
    };
    return on(el, "wheel", listener); // ignore chromium asking for { passive: true }, it's a trap (can't preventDefault)
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
    if (stringed && !stringed.startsWith("[object")) {
        return new Error(stringed);
    }
    return new Error(JSON.stringify(e));
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
    namespace Result {
        function flip<T, E>(): Result<E, T>;
    }
    interface Ok<T, E> {
        flip(): Err<E, T>;
    }
    interface Err<T, E> {
        flip(): Ok<E, T>;
    }
}
ResultAsync.prototype.finally = function <T, E>(fn: () => void): ResultAsync<T, E> {
    return this.andTee(fn).orTee(fn);
};
Ok.prototype.flip = function <T, E>(): Err<E, T> {
    return err(this.value);
}
Err.prototype.flip = function <T, E>(): Ok<E, T> {
    return ok(this.error);
}

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

    let queue: QueueValue[] | null = [];
    let resolve: Resolve | null = null;

    const tryResolve = () => {
        if (!resolve || !queue?.length) return;

        const value = queue.shift()!;
        // reentry (just in case)
        const r = resolve;
        resolve = null;
        r(value);
    };

    setup(
        (value) => { queue?.push(value) && tryResolve(); },
        () => { queue?.push(DONE) && tryResolve(); }
    );

    while (true) {
        const value: QueueValue
            = queue.length ? queue.shift()!
            : await new Promise<QueueValue>(r => resolve = r);

        if (value === DONE) break;
        yield value;
    }
    queue = null!;
}

// you're telling me not a single programmer in the history of programming ever needed this
export function localeTimeWithMs(d: Dayjs): string {
    const time = d.format('LTS');
    const ms = d.format('SSS');

    return time.endsWith('M') ? // 12-hour
        time.replace(/(\s*[AP]M)$/i, `.${ms}$1`)
        : `${time}.${ms}`;
}

export type Fn = () => void;
export type DebouncedFn = Fn & { cancel: Fn, now: Fn };
export function debounced(func: () => void, delayMs: number): DebouncedFn {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    function f() {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(func, delayMs);
    };
    f.cancel = () => timeout && clearTimeout(timeout);
    f.now = () => {
        f.cancel();
        func();
    };
    return f;
}

export function formatZodError<E extends ZodError>(e: E) {
    return e.issues.map(i => `${i.path.join('.') || "(root)"}: ${i.message}`);
}

export function isApril1st() {
    if (dev) return true;
    const today = new Date();
    // month 0-indexed, day 1-indexed. make it make sense
    return today.getMonth() === 3 && today.getDate() === 1;
}

export function binarySearch<T>(sortedArr: T[], target: any): number {
    let left = 0, right = sortedArr.length - 1;
    while (left <= right) {
        const mid = (left + right) >>> 1;
        if (sortedArr[mid] === target) return mid;
        if (sortedArr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}

export function sortedIncludes<T>(sortedArr: T[], target: any): target is T {
    return binarySearch(sortedArr, target) >= 0;
}

declare global {
    interface Array<T> {
        binarySearch(item: any): number;
        sortedIncludes(item: any): item is T;
    }
    interface ReadonlyArray<T> {
        binarySearch(item: any): (number & keyof this) | -1;
        sortedIncludes(item: any): item is T;
    }
}
Array.prototype.binarySearch = function<T>(this: T[], item: any) {
    return binarySearch(this, item);
}
Array.prototype.sortedIncludes = function<T>(this: T[], item: any): item is T {
    return sortedIncludes(this, item);
}
