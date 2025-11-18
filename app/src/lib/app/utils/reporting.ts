import * as log from "@tauri-apps/plugin-log";
import { toast, type ExternalToast } from "svelte-sonner";

export interface Reporter {
    /** Minimum log level. */
    level: LogLevel;
    /** Minimum log level to auto-show toasts for. */
    autoToastLevel: LogLevel;
    defaultToastOptions: ToastOptions;
    
    report: (level: LogLevel, options: ReportOptions) => Promise<void>;
    
    verbose: ReportFunc;
    debug: ReportFunc;
    info: ReportFunc;
    success: ReportFunc; // success toast
    warn: ReportFunc;
    error: ReportFunc;
    fatal: ReportFunc; // TODO: modal for fatal
    
    /** @deprecated use verbose */
    trace: ReportFunc;
    /** @deprecated use warn */
    warning: ReportFunc;
    /** @deprecated use fatal */
    critical: ReportFunc;
}

export enum LogLevel {
    Verbose,
    Debug,
    Info,
    Success,
    Warning,
    Error,
    Fatal
}

export type ReportOptions = {
    message: string;
    details?: string;
    toast?: boolean | ToastOptions;
    target?: string; // TODO
    ctx?: Record<string, any>;
};

export type ToastOptions = ExternalToast & {
    title?: string; // override for toast title
    level?: LogLevel;
}

export type ReportFunc = {
    /** Shorthand for simple logging. */
    (message: string, details?: string): Promise<void>;
    (message: string, options: Omit<ReportOptions, "message">): Promise<void>;
    (options: ReportOptions): Promise<void>;
};

class DefaultReporter implements Reporter {
    defaultToastOptions: ToastOptions = {};
    trace: ReportFunc;
    warning: ReportFunc;
    critical: ReportFunc;

    constructor(public level: LogLevel, public autoToastLevel: LogLevel = LogLevel.Warning) {
        this.trace = this.verbose;
        this.warning = this.warn;
        this.critical = this.fatal;
    }

    verbose(...args: any[]): Promise<void> {
        return this.gatherOptsAndReport(LogLevel.Verbose, args);
    }
    debug(...args: any[]): Promise<void> {
        return this.gatherOptsAndReport(LogLevel.Debug, args);
    }
    info(...args: any[]): Promise<void> {
        return this.gatherOptsAndReport(LogLevel.Info, args);
    }
    success(...args: any[]): Promise<void> {
        return this.gatherOptsAndReport(LogLevel.Success, args);
    }
    warn(...args: any[]): Promise<void> {
        return this.gatherOptsAndReport(LogLevel.Warning, args);
    }
    error(...args: any[]): Promise<void> {
        return this.gatherOptsAndReport(LogLevel.Error, args);
    }
    fatal(...args: any[]): Promise<void> {
        return this.gatherOptsAndReport(LogLevel.Fatal, args);
    }
    async report(level: LogLevel, options: ReportOptions): Promise<void> {
        if (level < this.level) {
            return;
        }
        let logFuncMap: Record<LogLevel, (message: string) => void> = {
            [LogLevel.Verbose]: log.trace,
            [LogLevel.Debug]: log.debug,
            [LogLevel.Info]: log.info,
            [LogLevel.Success]: log.info,
            [LogLevel.Warning]: log.warn,
            [LogLevel.Error]: log.error,
            [LogLevel.Fatal]: log.error,
        };
        // no tauri available (e.g. browser on dev vite server)
        if (!('__TAURI_INTERNALS__' in window)) {
            logFuncMap = {
                [LogLevel.Verbose]: console.log,
                [LogLevel.Debug]: console.debug,
                [LogLevel.Info]: console.info,
                [LogLevel.Success]: console.info,
                [LogLevel.Warning]: console.warn,
                [LogLevel.Error]: console.error,
                [LogLevel.Fatal]: console.error,
            }
        }
        const logFunc = logFuncMap[level];
        let msg = options.message;
        if (options.details) {
            msg += `\nDetails: ${options.details}`;
        }
        if (options.ctx) {
            msg += `\nContext: ${JSON.stringify(options.ctx)}`;
        }
        logFunc(msg);
        if (options.toast) {
            const toastFuncMap = {
                [LogLevel.Verbose]: toast.message,
                [LogLevel.Debug]: toast.message,
                [LogLevel.Info]: toast.info,
                [LogLevel.Success]: toast.success,
                [LogLevel.Warning]: toast.warning,
                [LogLevel.Error]: toast.error,
                [LogLevel.Fatal]: toast.error,
            };
            const toastOptions: ToastOptions = {
                ...this.defaultToastOptions,
                description: options.details,
                ...(typeof(options.toast) === "boolean" ? {} : options.toast),
            };
            // console.log(options, toastOptions);
            const toastFunc = toastFuncMap[toastOptions.level ?? level];
            toastFunc(toastOptions.title ?? options.message, toastOptions);
        }
    }

    private gatherOptsAndReport(level: LogLevel, args: any[]): Promise<void> {
        if (args.length != 1 && args.length != 2) {
            throw new Error("Invalid number of arguments", { cause: args });
        }
        let opts: ReportOptions = {} as ReportOptions;
        if (args.length >= 1) {
            opts = typeof(args[0]) === "string"
                ? { message: args[0] }
                : args[0];
            if (args.length == 2) {
                if (typeof(args[1]) === "string") {
                    opts.details = args[1];
                } else {
                    opts = {
                        message: opts.message,
                        ...args[1],
                    };
                }
            }
        }
        if (!opts.message) {
            throw new Error("No message provided", { cause: args });
        }
        // TODO: user configurable
        if (level >= this.autoToastLevel && opts.toast === undefined) {
            opts.toast = true;
        }
        return this.report(level, opts);
    }
}

const defaultReporter = new DefaultReporter(LogLevel.Verbose);

export default defaultReporter as Reporter;
