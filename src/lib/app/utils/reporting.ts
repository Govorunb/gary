import { toast, type ExternalToast } from "svelte-sonner";
import { isTauri } from "@tauri-apps/api/core";
import { safeInvoke } from ".";

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
    success: ReportFunc;
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
    Success, // behaves like info log level (but toasts have a 'success' type)
    Warning,
    Error,
    Fatal // behaves like 'error' (but ideally there should be a modal for a GH issue flow and such)
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
        let msg = options.message;
        if (options.details) {
            msg += `\nDetails: ${options.details}`;
        }
        if (options.ctx) {
            msg += `\nContext: ${JSON.stringify(options.ctx)}`;
        }
        // TODO: user configurable
        if (level >= this.autoToastLevel && options.toast === undefined) {
            options.toast = true;
        }

        let logFunc: (message: string) => void;
        if (!isTauri()) {
            const logFuncMap: Record<LogLevel, (message: string) => void> = {
                [LogLevel.Verbose]: console.log,
                [LogLevel.Debug]: console.debug,
                [LogLevel.Info]: console.info,
                [LogLevel.Success]: console.info,
                [LogLevel.Warning]: console.warn,
                [LogLevel.Error]: console.error,
                [LogLevel.Fatal]: console.error,
            };
            // dev only
            const loc = getCallerLocation(4 + (options.ignoreStackLevels ?? 0));
            msg = `[${LogLevel[level]}] ${msg}\nTarget: [${options.target ?? "webview"}:${loc}]`;
            logFunc = logFuncMap[level];
        } else {
            logFunc = (message: string) => safeInvoke("gary_log", {
                level,
                message,
                target: options.target,
                // stack depth:
                //      0 getCallerLocation
                //      1 <closure>
                //      2 report
                //      3 gatherOptsAndReport
                //      4 trace
                //      5 actual_caller
                // jfc
                location: getCallerLocation(5 + (options.ignoreStackLevels ?? 0)),
            }).orTee(err => toast.error("Failed to log!", { description: err }));
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
        if (args.length !== 1 && args.length !== 2) {
            throw new Error("Invalid number of arguments", { cause: args });
        }
        let opts: ReportOptions = {} as ReportOptions;
        if (args.length >= 1) {
            opts = typeof(args[0]) === "string"
                ? { message: args[0] }
                : args[0];
            if (args.length === 2) {
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
        return this.report(level, opts);
    }
}

const defaultReporter = new DefaultReporter(LogLevel.Verbose);

export default defaultReporter as Reporter;

// adapted from https://github.com/tauri-apps/plugins-workspace/blob/ce6835d50ff7800dcfb8508a98e9ee83771fb283/plugins/log/guest-js/index.ts#L47
function getCallerLocation(targetStackDepth: number = 5): string | undefined {
    const stack = new Error().stack;
    if (!stack) return "(no stack)";

    let filePathStart: number;
    try {
        // no window in e.g. tests
        filePathStart = window.location.origin.length;
    } catch {
        filePathStart = 0;
    }

    if (stack.startsWith('Error')) {
        // Assume it's Chromium V8
        //
        // Error
        //     at baz (filename.js:10:15)
        //     at bar (filename.js:6:3)
        //     at foo (filename.js:2:3)
        //     at filename.js:13:1

        const lines = stack.split('\n');
        const callerLine = lines[targetStackDepth+1]?.trim();
        if (!callerLine) return;

        const regex = /at\s+(?<functionName>.*?)\s+\((?<filePath>.*?):(?<lineNumber>\d+):(?<columnNumber>\d+)\)/;
        const match = callerLine.match(regex);

        if (match) {
            // TODO: line numbers seem to be from *after* svelte compiles the file (i.e. they're inaccurate)
            // no clue if it's because of HMR or if i haven't enabled some setting but :shrug:
            const { functionName, filePath, /* lineNumber, columnNumber */ } = match.groups as {
                functionName: string
                filePath: string
                lineNumber: string
                columnNumber: string
            };
            return `${functionName}@${filePath.substring(Math.max(filePathStart, filePath.indexOf("src/")))}`;
            // return `${functionName}@${filePath}:${lineNumber}:${columnNumber}`;
        } else {
            // Handle cases where the regex does not match (e.g., last line without function name)
            const regexNoFunction = /at\s+(?<filePath>.*?):(?<lineNumber>\d+):(?<columnNumber>\d+)/;
            const matchNoFunction = callerLine.match(regexNoFunction);
            if (matchNoFunction) {
                // here, we leave line numbers in because, well... better than nothing
                const { filePath, lineNumber, columnNumber } = matchNoFunction.groups as {
                    filePath: string
                    lineNumber: string
                    columnNumber: string
                };
                return `<anonymous>@${filePath.substring(Math.max(filePathStart, filePath.indexOf("src/")))}:${lineNumber}:${columnNumber}`;
            }
        }
    } else {
        // Assume it's Webkit JavaScriptCore, example:
        //
        // baz@filename.js:10:24
        // bar@filename.js:6:6
        // foo@filename.js:2:6
        // global code@filename.js:13:4

        const traces = stack.split('\n').map((line) => line.split('@'));
        const filtered = traces
            .filter(([name, location]) => name.length > 0 && location !== '[native code]')
            // before: initDI@http://localhost:1420/src/lib/app/session.svelte.ts:44:19
            // after: initDI@src/lib/app/session.svelte.ts
            // seems to use the containing fn for closures, thank god (webkit 1, chromium 999)
            .map(([name, loc]) => [name, loc.substring(Math.max(filePathStart, loc.indexOf("src/"))).replaceAll(/(:\d+)*$/g, "")]);
        return filtered[targetStackDepth]?.filter((v) => v.length > 0).join('@');
    }
}
