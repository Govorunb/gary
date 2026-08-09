import { PressedKeys } from "runed";
import { onDestroy } from "svelte";
import { on } from "svelte/events";

export const pressedKeys = new PressedKeys();

const MODIFIER_KEYS = new Set(["meta", "control", "alt", "shift"]);

export function registerAppHotkey(targetKeys: string[], callback: () => void) {
    targetKeys = targetKeys.map(k => k.toLowerCase());
    const down = new Set<string>();

    const keydown = on(window, "keydown", (e) => {
        const key = e.key.toLowerCase();
        const firstPress = !down.has(key);
        down.add(key);
        if (targetKeys.every(target => down.has(target))) {
            e.preventDefault();
            if (firstPress && targetKeys.includes(key)) callback();
        }
    });
    const keyup = on(window, "keyup", (e) => {
        const key = e.key.toLowerCase();
        if (MODIFIER_KEYS.has(key)) {
            for (const pressed of down) {
                if (!MODIFIER_KEYS.has(pressed)) down.delete(pressed);
            }
        }
        down.delete(key);
    });
    const blur = on(window, "blur", () => down.clear());
    const visibilityChange = on(document, "visibilitychange", () => {
        if (document.visibilityState === "hidden") down.clear();
    });

    onDestroy(() => {
        keydown();
        keyup();
        blur();
        visibilityChange();
    });
}
