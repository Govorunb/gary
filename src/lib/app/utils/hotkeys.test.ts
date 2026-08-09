import { afterEach, expect, test, vi } from "vitest";
import { registerAppHotkey } from "./hotkeys.svelte";

const lifecycle = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }));

vi.mock("svelte", async importOriginal => ({
    ...await importOriginal<typeof import("svelte")>(),
    onDestroy: vi.fn((cleanup: () => void) => lifecycle.cleanup = cleanup),
}));

function keyEvent(type: "keydown" | "keyup", key: string) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "key", { value: key });
    return event;
}

afterEach(() => {
    lifecycle.cleanup = undefined;
    vi.unstubAllGlobals();
});

test("registerAppHotkey owns and removes every listener", () => {
    const fakeWindow = new EventTarget();
    const fakeDocument = new EventTarget();
    Object.defineProperty(fakeDocument, "visibilityState", { value: "visible", configurable: true });
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", fakeDocument);
    const callback = vi.fn();
    registerAppHotkey(["Control", "K"], callback);

    fakeWindow.dispatchEvent(keyEvent("keydown", "Control"));
    const activation = keyEvent("keydown", "K");
    fakeWindow.dispatchEvent(activation);

    expect(callback).toHaveBeenCalledOnce();
    expect(activation.defaultPrevented).toBe(true);

    expect(lifecycle.cleanup).toBeTypeOf("function");
    lifecycle.cleanup!();
    fakeWindow.dispatchEvent(keyEvent("keyup", "K"));
    fakeWindow.dispatchEvent(keyEvent("keydown", "K"));
    expect(callback).toHaveBeenCalledOnce();
});
