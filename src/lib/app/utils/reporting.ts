import type { ExternalToast } from "svelte-sonner";
import { isTauri } from "@tauri-apps/api/core";
import { safeInvoke, LogLevel } from ".";
import { EVENT_BUS } from "../events/bus";
import { EVENTS_BY_KEY, EVENTS_DISPLAY, eventLevel, type EventDef, type EventInstance, type EventKey } from "../events";
import { boundedToast } from "./bounded-toast";

export interface Reporter {
    /** Deprecated: event reporting currently logs all levels. */
    level: LogLevel;
    /** Minimum log level to auto-show toasts for. */
    autoToastLevel: LogLevel;
}

export type ToastOptions = ExternalToast & {
    title?: string; // override for toast title
    level?: LogLevel; // override for toast type (use it to e.g. show warning toasts on info/success events)
};

const CONSOLE_METHOD = {
    [LogLevel.Verbose]: "log",
    [LogLevel.Debug]: "debug",
    [LogLevel.Info]: "info",
    [LogLevel.Success]: "info",
    [LogLevel.Warning]: "warn",
    [LogLevel.Error]: "error",
    [LogLevel.Fatal]: "error",
} as const satisfies Record<LogLevel, keyof Console>;

/**
 * The app's log file, written in batches: an IPC call costs about as much as handling a game message, and every event is logged.
 * Warnings and worse go out at once, with everything queued before them, so a crash doesn't take them along.
 */
class AppLog {
    #entries: { level: LogLevel; message: string }[] = [];
    #timer: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        addEventListener("pagehide", () => this.flush());
    }

    write(level: LogLevel, message: string) {
        this.#entries.push({ level, message });
        if (level >= LogLevel.Warning) this.flush();
        else this.#timer ??= setTimeout(() => this.flush(), 100);
    }

    flush() {
        clearTimeout(this.#timer);
        this.#timer = undefined;
        if (!this.#entries.length) return;
        const entries = this.#entries;
        this.#entries = [];
        void safeInvoke("gary_log", { entries })
            .orTee(err => boundedToast.error("Failed to log!", { description: err, priority: LogLevel.Error }));
    }
}

// The desktop app has the log file; the browser dev build logs to the console instead.
const appLog = isTauri() ? new AppLog() : null;

class DefaultReporter implements Reporter {
    constructor(public level: LogLevel, public autoToastLevel: LogLevel = LogLevel.Warning) {
        const sub = EVENT_BUS.subscribe();
        sub.onnext(e => this.reportEvent(e));
    }

    reportEvent(e: EventInstance<EventKey>) {
        const def = EVENTS_BY_KEY[e.key] as EventDef;
        let level = eventLevel(e);

        let text: string;
        try {
            text = JSON.stringify({
                timestamp: e.timestamp,
                event: e.key,
                data: e.data
            });
        } catch (err) {
            // Still one JSON event per line in the log file.
            text = JSON.stringify({
                timestamp: e.timestamp,
                event: e.key,
                error: `Failed to stringify event data. Are you passing DI objects? ${err}`,
            });
            level = LogLevel.Fatal;
        }

        this.log(text, level);

        if (def.silent) return;
        const havePresenter = e.key in EVENTS_DISPLAY;
        const presenter = EVENTS_DISPLAY[e.key];
        const shouldPresent = havePresenter || level >= this.autoToastLevel;

        if (!presenter && !def.description) {
            if (shouldPresent) {
                const err = `Missing event presenter or description for ${e.key}!`;
                console.error(err);
                boundedToast.error(err, { priority: LogLevel.Error });
            }
            return;
        }
        if (!shouldPresent) return;

        const opts = presenter
            ? presenter(e.data as never)
            : { title: def.description };
        const combined = { level, ...opts } satisfies ToastOptions;
        this.toast(combined);
    }

    private log(message: string, level: LogLevel) {
        if (appLog) return appLog.write(level, message);
        console[CONSOLE_METHOD[level]](`[${LogLevel[level]}] ${message}`);
    }

    private toast(opts: ToastOptions) {
        const toastFuncMap = {
            [LogLevel.Verbose]: boundedToast.message,
            [LogLevel.Debug]: boundedToast.message,
            [LogLevel.Info]: boundedToast.info,
            [LogLevel.Success]: boundedToast.success,
            [LogLevel.Warning]: boundedToast.warning,
            [LogLevel.Error]: boundedToast.error,
            [LogLevel.Fatal]: boundedToast.error,
        };
        // console.log(options, opts);
        const { level = LogLevel.Info, title = "Notification", ...toastOpts } = opts;
        const toastFunc = toastFuncMap[level];
        toastFunc(title, { ...toastOpts, priority: level });
    }
}

const defaultReporter = new DefaultReporter(LogLevel.Verbose);

export default defaultReporter as Reporter;
