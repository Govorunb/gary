import type { Attachment } from "svelte/attachments";
import z from "zod";

export function pick<T>(arr: T[]) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export const webkitScrollNum: Attachment<HTMLInputElement> = (el) => {
    if (el.type !== "number") {
        console.warn("webkitScrollNum should only be attached to inputs of type 'number'");
        return;
    }
    // on linux, tauri uses libwebkit2gtk, which has a browser that is just kinda weird and offputting
    if (!navigator.platform.includes("Linux")) return;
    
    const listener = (evt: WheelEvent) => {
        const target = evt.target as HTMLInputElement;
        // increment/decrement on scroll (modern browsers do this by default btw)
        if (target.disabled) return;
        if (evt.deltaY == 0) return;
        evt.deltaY < 0 ? target.stepUp() : target.stepDown();
        target.dispatchEvent(new Event("input")); // svelte 5 targets 'input' and not 'change'
    };
    el.addEventListener("wheel", listener);
    return () => {
        el.removeEventListener("wheel", listener);
    };
};

export function preventDefault<T, E extends Event, F extends (evt: E, ...args: any[]) => T>(func: F) {
    const f = (evt: E, ...args: any[]) => {
        evt.preventDefault();
        return func(evt, ...args);
    };
    return f as F;
}

export function throttleClick(delay: number, func: (evt: MouseEvent) => void): Attachment<HTMLButtonElement> {
    return (el) => {
        let timeout: number | null = null;
        const listener = (evt: MouseEvent): void => {
            if (timeout) clearTimeout(timeout);
            el.disabled = true;
            timeout = setTimeout(() => {
                el.disabled = false;
            }, delay);
            func(evt);
        };
        el.addEventListener("click", listener);
        // cleanup func
        return () => {
            if (timeout) clearTimeout(timeout);
            timeout = null;
            el.removeEventListener("click", listener);
        }
    };
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function outclick(func: () => void, additionalTargets: HTMLElement[] = []): Attachment<HTMLElement> {
    return (el) => {
        const listener = (evt: MouseEvent): void => {
            if (evt.target instanceof HTMLElement && (
                el.contains(evt.target) || additionalTargets.some(target => target.contains(evt.target as any))
            )) return;
            func();
        };
        window.addEventListener("pointerdown", listener);
        return () => {
            window.removeEventListener("pointerdown", listener);
        }
    };
}

/** This lets us omit the field when constructing discriminated union members from e.g. `zStartup.parse({})`. */
export function zConst<T extends z.core.util.Literal>(value: NonNullable<T>) {
    return z.literal(value).default(value);
}