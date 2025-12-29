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
    /** Performance/politeness considerations (spamming actions, long context, latency etc.)
     * Stuff that prevents Neuro from performing better.
     */
    Performance = "perf",
    /** idk everything else */
    Miscellaneous = "misc",
}

export interface DiagnosticDef {
    id: `${DiagnosticCategory}/${string}`;
    severity: DiagnosticSeverity;
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
        message: "Test diagnostic (info)",
        details: "You're really testing me, you know that?",
    },
    {
        id: "misc/test/warn",
        severity: DiagnosticSeverity.Warning,
        message: "Test diagnostic (warn)",
        details: "The next one... well... don't say I didn't warn you.",
    },
    {
        id: "misc/test/error",
        severity: DiagnosticSeverity.Error,
        message: "Test diagnostic (error)",
        details: "You failed to comprehend the nature of the attack!",
    },
    {
        id: "prot/invalid_message",
        severity: DiagnosticSeverity.Error,
        message: "Invalid WebSocket message received",
        details: "The game sent a message that doesn't conform to the API specification"
    },
    {
        id: "prot/v1/register/dupe",
        severity: DiagnosticSeverity.Warning,
        message: "Duplicate action registration attempted",
        details: `An action with this name is already registered.
Per v1 of the API specification, the incoming action is ignored and the existing is kept; this may not be the behaviour you expected or intended.`,
    },
    {
        id: "prot/unregister/unknown",
        severity: DiagnosticSeverity.Warning,
        message: "Unregistered unknown action",
        details: "The action was never registered. This may indicate a serious error or state desync (e.g. forgetting to re-register actions after a reconnect)."
    },
    {
        id: "prot/unregister/inactive",
        severity: DiagnosticSeverity.Info,
        message: "Pointless unregister",
        details: "Unregistering an action that's already unregistered is harmless, but you should still aim to reduce duplicate calls.",
    },
    {
        id: "prot/force/empty",
        severity: DiagnosticSeverity.Error,
        message: "Empty actions/force",
        details: "Sent 'actions/force' with no actions",
    },
    {
        id: "prot/force/some_invalid",
        severity: DiagnosticSeverity.Warning,
        message: "Partially invalid actions/force",
        details: "Not all actions were known/registered"
    },
    {
        id: "prot/force/all_invalid",
        severity: DiagnosticSeverity.Error,
        message: "Entirely invalid actions/force",
        details: "Sent an actions/force where none of the actions were registered.",
    },
    {
        id: "prot/force/multiple",
        severity: DiagnosticSeverity.Error,
        message: "Multiple actions/force at once",
        details: "Neuro can only handle one action force at a time.",
    },
    {
        id: "prot/v1/game_renamed",
        severity: DiagnosticSeverity.Warning,
        message: "Do not rename game",
        details: "The protocol forbids changing your game name mid-connection."
    },
    {
        id: "prot/startup/missing",
        severity: DiagnosticSeverity.Warning,
        message: "Missing startup message",
        details: "The first message sent must be a 'startup' message"
    },
    {
        id: "prot/startup/multiple",
        severity: DiagnosticSeverity.Warning,
        message: "Multiple startup messages",
        details: "Don't send more than one 'startup' message as it may reset Neuro's state."
    },
    {
        id: "perf/late/startup",
        severity: DiagnosticSeverity.Info,
        message: "Late startup",
        details: "The game should send a 'startup' message as soon as possible."
    },
    {
        id: "perf/late/action_result",
        severity: DiagnosticSeverity.Warning,
        message: "Late action result",
        details: `Send action results as soon as possible.
If the action is expected to take a long time, send a "validation" success result immediately and follow up later with a 'context' message.`
    },
    {
        id: "prot/result/error_nomessage",
        severity: DiagnosticSeverity.Warning,
        message: "Unsuccessful action result should have message",
        details: "Provide feedback to let Neuro know what went wrong."
    }
] as const satisfies DiagnosticDef[];

export type DiagnosticId = (typeof DIAGNOSTICS)[number]["id"];

export const DIAGNOSTICS_BY_ID = Object.fromEntries(
    DIAGNOSTICS.map(d => [d.id, d]) as [DiagnosticId, DiagnosticDef][]
) as Record<DiagnosticId, DiagnosticDef>;

export function getDiagnosticById(id: string): DiagnosticDef | undefined {
    return DIAGNOSTICS_BY_ID[id as DiagnosticId];
}

export const SeverityToLogLevel: Record<DiagnosticSeverity, LogLevel> = {
    [DiagnosticSeverity.Info]: LogLevel.Info,
    [DiagnosticSeverity.Warning]: LogLevel.Warning,
    [DiagnosticSeverity.Error]: LogLevel.Error,
    [DiagnosticSeverity.Fatal]: LogLevel.Fatal,
}
