import { LogLevel } from "$lib/app/utils/reporting";

export enum DiagnosticSeverity {
    Info = 0,
    Warning = 1,
    Error = 2,
    Fatal = 3, // disconnects WS
}

export enum DiagnosticCategory {
    /** Protocol violations (invalid messages, disallowed behaviours, etc.) */
    Protocol = "prot",
    /** Performance/politeness considerations (spamming actions, long context, etc.) */
    Quality = "rude",
    /** When the game takes too long. */
    Latency = "late",
    /** idk everything else */
    Miscellaneous = "misc",
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

export const DIAGNOSTICS = [
    {
        id: "misc/test/info",
        severity: DiagnosticSeverity.Info,
        category: DiagnosticCategory.Miscellaneous,
        message: "Test diagnostic (info)",
        details: "You're really testing me, you know that?",
    },
    {
        id: "misc/test/warn",
        severity: DiagnosticSeverity.Warning,
        category: DiagnosticCategory.Miscellaneous,
        message: "Test diagnostic (warn)",
        details: "The next one... well... don't say I didn't warn you.",
    },
    {
        id: "misc/test/error",
        severity: DiagnosticSeverity.Error,
        category: DiagnosticCategory.Miscellaneous,
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
        details: "Sent an actions/force where none of the actions were registered.",
    },
    {
        id: "prot/force/multiple",
        severity: DiagnosticSeverity.Error,
        category: DiagnosticCategory.Protocol,
        message: "Multiple actions/force at once",
        details: "Neuro can only handle one action force at a time.",
    },
    {
        id: "prot/v1/game_renamed",
        severity: DiagnosticSeverity.Warning,
        category: DiagnosticCategory.Protocol,
        message: "Do not rename game",
        details: "The protocol forbids changing your game name mid-connection."
    },
    {
        id: "prot/startup/missing",
        severity: DiagnosticSeverity.Warning,
        category: DiagnosticCategory.Protocol,
        message: "Missing startup message",
        details: "The client must send a 'startup' message as its first message"
    },
    {
        id: "prot/startup/multiple",
        severity: DiagnosticSeverity.Warning,
        category: DiagnosticCategory.Protocol,
        message: "Multiple startup messages",
        details: "Don't send more than one 'startup' message as it may reset Neuro's state."
    },
    {
        id: "late/startup",
        severity: DiagnosticSeverity.Info,
        category: DiagnosticCategory.Latency,
        message: "Late startup",
        details: "The game should send a 'startup' message as soon as possible."
    },
] as const;

export type DiagnosticId = (typeof DIAGNOSTICS)[number]["id"];

export function getDiagnosticById(id: string): DiagnosticDef | undefined {
    return DIAGNOSTICS.find(d => d.id === id);
}

export const SeverityToLogLevel: {
    [sev in DiagnosticSeverity]: LogLevel;
} = {
    [DiagnosticSeverity.Info]: LogLevel.Info,
    [DiagnosticSeverity.Warning]: LogLevel.Warning,
    [DiagnosticSeverity.Error]: LogLevel.Error,
    [DiagnosticSeverity.Fatal]: LogLevel.Fatal,
}
