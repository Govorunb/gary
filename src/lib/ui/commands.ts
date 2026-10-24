import type { Chord } from "#lib/app/commands.js";
import type { Session } from "#lib/app/session.svelte.js";
import { clearLocalStorage } from "#lib/app/utils/index.js";

/** The hotkeys dialog's sections, in order. */
export const HOTKEY_GROUPS = [
    "Anywhere",
    "Top bar",
    "Actions list",
    "Add to context",
    "Engine picker",
    "Manual send",
    "Raw message",
    "Diagnostics",
] as const;
export type HotkeyGroup = (typeof HOTKEY_GROUPS)[number];

/**
 * Something only the app's own UI does, and so never an agent tool.
 * Without `run`, it's either a component's own action, or a modifier gesture on a control that's only listed in the hotkeys dialog.
 * A component's own action works only while that component binds its keys (`onCommandKeys` or `chordPressed`).
 */
type UICommand = {
    title: string;
    group?: HotkeyGroup;
    keys: Chord[];
    run?(session: Session): void;
};

const ui = <K extends string>(commands: Record<K, UICommand>) => commands;

/** In the hotkeys dialog's order within each section. Entries without a section are unlisted dev hotkeys. */
export const UI_COMMANDS = ui({
    toggleHotkeys: { title: "This list", group: "Anywhere", keys: [["F1"], ["Control", "/"]], run: s => s.uiState.dialogs.toggle({ type: "hotkeys" }) },
    toggleSettings: { title: "Settings", group: "Anywhere", keys: [["Control", ","]], run: s => s.uiState.dialogs.toggle({ type: "settings" }) },
    toggleEnginePicker: { title: "Engine picker", group: "Anywhere", keys: [["Control", "E"]], run: s => s.uiState.dialogs.toggle({ type: "enginePicker", engineId: null }) },
    openContextInput: { title: "Add to context", group: "Anywhere", keys: [["Alt", "C"]] },
    revealSecondLayer: { title: "Hold to reveal second-layer options where the arrow indicator is shown", group: "Anywhere", keys: [["Shift"]] },

    forceActClick: { title: "Force act", group: "Top bar", keys: [["Shift", 'click "Act"']] },
    stopActClick: { title: "Stop the current act", group: "Top bar", keys: [["Shift", 'click "Busy"']] },
    stopServerClick: { title: "Stop the server without confirming", group: "Top bar", keys: [["Shift", "click power"]] },

    sendActionClick: { title: "Send the action (opens manual send if it has a schema)", group: "Actions list", keys: [["Control", "click row"]] },

    closeContextInput: { title: "Close", group: "Add to context", keys: [["Escape"]] },
    invertSilent: { title: "Hold to invert silent for one message", group: "Add to context", keys: [["Shift"]] },

    quickSelectEngine: { title: "Quick-select engine by position", group: "Engine picker", keys: [["1"], ["2"], ["3"], ["4"], ["5"], ["6"], ["7"], ["8"], ["9"]] },
    engineConfigClick: { title: "Open its config", group: "Engine picker", keys: [["Alt", "click engine"]] },
    addEngine: { title: "Add an OpenAI-compatible engine", group: "Engine picker", keys: [["Alt", "A"]] },
    revealDelete: { title: "Hold to reveal delete buttons", group: "Engine picker", keys: [["Shift"]] },
    saveEngineConfig: { title: "Save engine config", group: "Engine picker", keys: [["Control", "Enter"]] },

    sendManual: { title: "Send", group: "Manual send", keys: [["Control", "Enter"]] },
    randomizeManual: { title: "Fill with random data", group: "Manual send", keys: [["Alt", "R"]] },
    bypassValidation: { title: "Hold to send despite validation errors", group: "Manual send", keys: [["Shift"]] },

    sendRaw: { title: "Send", group: "Raw message", keys: [["Control", "Enter"]] },

    clearDiagnosticsClick: { title: "Delete all diagnostics instead of dismissing", group: "Diagnostics", keys: [["Shift", 'click "Dismiss all"']] },

    resetPrefs: { title: "Reset preferences", keys: [["Backspace", "Delete", "Shift", "L"]], run: () => clearLocalStorage() },
    enterSafeMode: { title: "Enter safe mode", keys: [["Control", "Shift", "+", "S"]], run: s => s.userPrefs.loadError = "." },
    toggleAprilFools: { title: "Toggle April Fools", keys: [["Alt", "Enter", "A", "1"]], run: s => s.uiState.devToggleAprilFools() },
});

const KEY_LABELS: Record<string, string> = { Control: "Ctrl", Escape: "Esc" };
export const keyLabel = (key: string) => KEY_LABELS[key] ?? key;

/** The first chord as text, e.g. "Ctrl+Enter", for tooltips. */
export const keysLabel = ({ keys }: { keys?: Chord[] }) => keys?.[0].map(keyLabel).join("+") ?? "";

/** Alternative chords are joined by "or"; a run of digits collapses to "1 to 9". */
export function displayChords(keys: Chord[]): { chords: Chord[]; separator: "or" | "to" } {
    const digitRun = keys.length > 2 && keys.every((chord, i) => chord.length === 1 && chord[0] === String(Number(keys[0][0]) + i));
    return digitRun ? { chords: [keys[0], keys[keys.length - 1]], separator: "to" } : { chords: keys, separator: "or" };
}
