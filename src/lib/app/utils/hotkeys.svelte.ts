import { PressedKeys } from "runed";
import { onDestroy } from "svelte";
import { on } from "svelte/events";
import type { Chord } from "../commands";

export const pressedKeys = new PressedKeys();

const MODIFIER_KEYS = new Set(["meta", "control", "alt", "shift"]);

/** Calls back when any of the chords is completed, for the calling component's lifetime. */
export function registerAppHotkey(chords: Chord[], callback: () => void) {
    chords = chords.map(chord => chord.map(k => k.toLowerCase()));
    const down = new Set<string>();

    const keydown = on(window, "keydown", (e) => {
        const key = e.key.toLowerCase();
        const firstPress = !down.has(key);
        down.add(key);
        for (const chord of chords) {
            if (!chord.every(target => down.has(target))) continue;
            e.preventDefault();
            if (firstPress && chord.includes(key)) return callback();
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

/** For an element's own keydown handler: whether the event completes one of the command's chords. Modifiers count by the event's flags. */
export function chordPressed(e: KeyboardEvent, { keys = [] }: { keys?: Chord[] }) {
    return keys.some(chord => chord.every(key => e.getModifierState(key) || e.key.toLowerCase() === key.toLowerCase()));
}

/** Binds the command's chords through a component's own `PressedKeys`, as its `onKeys` does. */
export function onCommandKeys(pressed: PressedKeys, { keys }: { keys: Chord[] }, callback: () => void) {
    for (const chord of keys) pressed.onKeys(chord, callback);
}
