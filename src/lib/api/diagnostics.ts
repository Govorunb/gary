import { LogLevel } from "$lib/app/utils/reporting";

export enum DiagnosticSeverity {
    Info = 0,
    Warning = 1,
    Error = 2
}

export enum DiagnosticCategory {
    Protocol = "prot",
    Performance = "perf",
    Connection = "conn",
    Latency = "late",
    Miscellaneous = "misc",
    Testing = "test",
}

export interface DiagnosticDef {
    id: string;
    severity: DiagnosticSeverity;
    category: DiagnosticCategory;
    message: string;
    details?: string;
}

export interface GameDiagnostic<TContext = any> {
    id: string;
    timestamp: number;
    context?: TContext;
    dismissed?: boolean;
}

export const DIAGNOSTICS: DiagnosticDef[] = [
    {
        id: "test/info",
        severity: DiagnosticSeverity.Info,
        category: DiagnosticCategory.Testing,
        message: "Test diagnostic (info)",
        details: "You're really testing me, you know that?",
    },
    {
        id: "test/warn",
        severity: DiagnosticSeverity.Warning,
        category: DiagnosticCategory.Testing,
        message: "Test diagnostic (warn)",
        details: "The next one... well... don't say I didn't warn you.",
    },
    {
        id: "test/error",
        severity: DiagnosticSeverity.Error,
        category: DiagnosticCategory.Testing,
        message: "Test diagnostic (error)",
        details: "You failed to comprehend the nature of the attack!",
    },
    {
        id: "prot/invalid_message",
        severity: DiagnosticSeverity.Error,
        category: DiagnosticCategory.Protocol,
        message: "Invalid WebSocket message received",
        details: "The game sent a message that doesn't conform to the API specification"
    },
    {
        id: "prot/v1/register/dupe",
        severity: DiagnosticSeverity.Warning,
        category: DiagnosticCategory.Protocol,
        message: "Duplicate action registration attempted",
        details: `An action with this name is already registered.
Per v1 of the API specification, the incoming action is ignored and the existing is kept; this may not be the behaviour you expected or intended.`,
    },
    {
        id: "prot/unregister/unknown",
        severity: DiagnosticSeverity.Warning,
        category: DiagnosticCategory.Protocol,
        message: "Unregistered unknown action",
        details: "The action was never registered. This may indicate a serious error or state desync (e.g. forgetting to re-register actions after a reconnect)."
    },
    {
        id: "prot/unregister/inactive",
        severity: DiagnosticSeverity.Info,
        category: DiagnosticCategory.Protocol,
        message: "Unregistered an action more than once",
        details: "Unregistering an action multiple times is harmless, but you should still aim to reduce duplicate calls.",
    },
    {
        id: "prot/force/empty",
        severity: DiagnosticSeverity.Error,
        category: DiagnosticCategory.Protocol,
        message: "Empty actions/force",
        details: "Sent actions/force with no actions",
    },
    {
        id: "prot/force/some_invalid",
        severity: DiagnosticSeverity.Warning,
        category: DiagnosticCategory.Protocol,
        message: "Partially invalid actions/force",
        details: "Not all actions were known/registered"
    },
    {
        id: "prot/force/all_invalid",
        severity: DiagnosticSeverity.Error,
        category: DiagnosticCategory.Protocol,
        message: "Entirely invalid actions/force",
        details: "Sent an actions/force where none of the actions were registered",
    },
    {
        id: "prot/v1/game_renamed",
        severity: DiagnosticSeverity.Warning,
        category: DiagnosticCategory.Protocol,
        message: "Do not rename game",
        details: "The protocol forbids changing your game name mid-connection"
    }
];

export function getDiagnosticById(id: string): DiagnosticDef | undefined {
    return DIAGNOSTICS.find(d => d.id === id);
}

export const SeverityToLogLevel = {
    [DiagnosticSeverity.Info]: LogLevel.Info,
    [DiagnosticSeverity.Warning]: LogLevel.Warning,
    [DiagnosticSeverity.Error]: LogLevel.Error,
}
