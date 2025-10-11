import type { Attachment } from "svelte/attachments";

export function pick<T>(arr: T[]) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export const scrollNum: Attachment<HTMLInputElement> = (el) => {
    if (el.type !== "number") return;
    
    el.addEventListener("wheel", (evt: WheelEvent) => {
        // tauri uses libwebkit2gtk which has a browser that is just kinda weird and offputting
        if (!navigator.platform.includes("Linux")) return;
        
        const target = evt.target as HTMLInputElement;
        // increment/decrement on scroll (modern browsers do this by default btw)
        if (target.disabled) return;
        if (evt.deltaY == 0) return;
        evt.deltaY < 0 ? target.stepUp() : target.stepDown();
        target.dispatchEvent(new Event("input")); // svelte 5 targets 'input' and not 'change'
    });
};

export function preventDefault<T, E extends Event, F extends (evt: E, ...args: any[]) => T>(func: F) {
    const f = (evt: E, ...args: any[]) => {
        evt.preventDefault();
        return func(evt, ...args);
    };
    return f as F;
}
