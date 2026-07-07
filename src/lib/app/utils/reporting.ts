import type { ExternalToast } from "svelte-sonner";
import { isTauri } from "@tauri-apps/api/core";
import { safeInvoke, LogLevel } from ".";
import { EVENT_BUS } from "../events/bus";
import { EVENTS_BY_KEY, EVENTS_DISPLAY, type EventDef, type EventInstance, type EventKey } from "../events";
import { boundedToast } from "./bounded-toast";

export interface Reporter {
    /** Deprecated: event reporting currently logs all levels. */
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
        const presenter = EVENTS_DISPLAY[e.key];
        const shouldPresent = havePresenter || e.levelOverride !== undefined || level >= this.autoToastLevel;

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
            }).orTee(err => boundedToast.error("Failed to log!", { description: err, priority: LogLevel.Error }));
        }
        logFunc(msg);
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
