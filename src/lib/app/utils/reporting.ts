import { toast, type ExternalToast } from "svelte-sonner";
import { isTauri } from "@tauri-apps/api/core";
import { safeInvoke, LogLevel } from ".";
import { EVENT_BUS } from "../events/bus";
import { EVENTS_BY_KEY, EVENTS_DISPLAY, type EventDef, type EventInstance, type EventKey } from "../events";

export interface Reporter {
    /** Minimum log level. */
    level: LogLevel;
    /** Minimum log level to auto-show toasts for. */
    autoToastLevel: LogLevel;
}

export type ReportOptions = {
    message: string;
    details?: string;
    toast?: boolean | ToastOptions;
    target?: string;
    ctx?: Record<string, any>;
    ignoreStackLevels?: number;
};

export type ToastOptions = ExternalToast & {
    title?: string; // override for toast title
    level?: LogLevel; // override for toast type (use it to e.g. show warning toasts on info/success events)
};

class DefaultReporter implements Reporter {
    constructor(public level: LogLevel, public autoToastLevel: LogLevel = LogLevel.Warning) {
        const sub = EVENT_BUS.subscribe();
        sub.onnext(e => this.reportEvent(e));
    }

    reportEvent(e: EventInstance<EventKey>) {
        const def = EVENTS_BY_KEY[e.key] as EventDef;
        let level = e.levelOverride ?? def.level ?? LogLevel.Info;

        let text: string;
        try {
            text = JSON.stringify({
                timestamp: e.timestamp,
                event: e.key,
                data: e.data
            });
        } catch (err) {
            text = `Failed to stringify event. Are you passing DI objects? Error: ${err}`;
            level = LogLevel.Fatal;
        }

        this.log({ message: text }, level);

        const havePresenter = e.key in EVENTS_DISPLAY;
        const presenter = EVENTS_DISPLAY[e.key] ?? def.description;
        const shouldPresent = havePresenter || e.levelOverride !== undefined || level >= this.autoToastLevel;

        if (!presenter) {
            if (shouldPresent) {
                const err = `Missing event presenter or description for ${e.key}!`;
                console.error(err);
                toast.error(err);
            }
            return;
        }
        if (!shouldPresent) return;

        const display = typeof presenter === "function"
            ? presenter(e.data as never)
            : presenter;
        const opts: ToastOptions = typeof display === "string"
            ? { title: display }
            : display;
        const combined = { level, ...opts } satisfies ToastOptions;
        this.toast(combined);
    }

    private log(options: ReportOptions, level: LogLevel, loc?: string) {
        let msg = options.message;

        if (options.details) msg += `\nDetails: ${options.details}`;
        if (options.ctx) msg += `\nContext: ${JSON.stringify(options.ctx)}`;

        let logFunc: (message: string) => void;
        if (!isTauri()) { // dev only (vite dev server + browser)
            const logFuncMap: Record<LogLevel, (message: string) => void> = {
                [LogLevel.Verbose]: console.log,
                [LogLevel.Debug]: console.debug,
                [LogLevel.Info]: console.info,
                [LogLevel.Success]: console.info,
                [LogLevel.Warning]: console.warn,
                [LogLevel.Error]: console.error,
                [LogLevel.Fatal]: console.error,
            };
            const target = [options.target ?? "webview", loc].filter(Boolean).join(':');
            msg = `[${LogLevel[level]}] ${msg}\nTarget: [${target}]`;
            logFunc = logFuncMap[level];
        } else {
            logFunc = (message: string) => safeInvoke("gary_log", {
                level,
                message,
                target: options.target,
                location: loc,
            }).orTee(err => toast.error("Failed to log!", { description: err }));
        }
        logFunc(msg);
    }

    private toast(opts: ToastOptions) {
        const toastFuncMap = {
            [LogLevel.Verbose]: toast.message,
            [LogLevel.Debug]: toast.message,
            [LogLevel.Info]: toast.info,
            [LogLevel.Success]: toast.success,
            [LogLevel.Warning]: toast.warning,
            [LogLevel.Error]: toast.error,
            [LogLevel.Fatal]: toast.error,
        };
        // console.log(options, opts);
        const toastFunc = toastFuncMap[opts.level!];
        toastFunc(opts.title!, opts);
    }
}

const defaultReporter = new DefaultReporter(LogLevel.Verbose);

export default defaultReporter as Reporter;
