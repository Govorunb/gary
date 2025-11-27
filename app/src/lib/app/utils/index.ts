import type { Attachment } from "svelte/attachments";
import z from "zod";
import { ok, err, type Result, ResultAsync } from "neverthrow";
import { invoke, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import { on } from "svelte/events";
import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";

export function pickRandom<T>(arr: T[]) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export const webkitScrollNum: Attachment<HTMLInputElement> = (el) => {
    if (el.type !== "number") {
        console.warn("webkitScrollNum should only be attached to inputs of type 'number'");
        return;
    }
    // on linux, tauri uses libwebkit2gtk, which is just kinda generally weird and offputting
    if (!navigator.platform.includes("Linux")) return;
    
    const listener = (evt: WheelEvent) => {
        const target = evt.target as HTMLInputElement;
        // increment/decrement on scroll (modern browsers do this by default btw)
        if (target.disabled) return;
        if (evt.deltaY === 0) return;
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
    if (!Number.isFinite(value) || step === 0 || step >= 1) {
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
