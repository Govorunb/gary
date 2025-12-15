import { PressedKeys } from "runed";
import { on } from "svelte/events";

export const pressedKeys = new PressedKeys();

export function registerAppHotkey(targetKeys: string[], callback: () => void) {
    targetKeys = targetKeys.map(k => k.toLowerCase());
    pressedKeys.onKeys(targetKeys, callback);

    return on(window, 'keydown', (e) => {
        const realPressedKeys = [...pressedKeys.all, e.key.toLowerCase()];
        if (targetKeys.every(k => realPressedKeys.includes(k))) {
            e.preventDefault();
        }
    });
}
