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
    key: `${DiagnosticCategory}/${string}`;
    severity: DiagnosticSeverity;
    message: string;
    details?: string;
}

export interface GameDiagnostic<TContext = any> {
    id: string; // unique id for ui (key:timestamp was not unique enough)
    timestamp: number;
    key: DiagnosticKey;
    context?: TContext;
    dismissed?: boolean;
}

export const TIMEOUTS = {
    "perf/late/startup": 500,
    "perf/late/action_result": 500,
    "perf/timeout/action_result": 5000,
} as const;

const asyncResultNag = `If the action is expected to take a long time, send a "validation" success result immediately and follow up later with a 'context' message.`;

export const DIAGNOSTICS = [
    {
        key: "misc/test/info",
        severity: DiagnosticSeverity.Info,
        message: "Test diagnostic (info)",
        details: "You're really testing me, you know that?",
    },
    {
        key: "misc/test/warn",
        severity: DiagnosticSeverity.Warning,
        message: "Test diagnostic (warn)",
        details: "The next one... well... don't say I didn't warn you.",
    },
    {
        key: "misc/test/error",
        severity: DiagnosticSeverity.Error,
        message: "Test diagnostic (error)",
        details: "You failed to comprehend the nature of the attack!",
    },
    {
        key: "prot/invalid_message",
        severity: DiagnosticSeverity.Error,
        message: "Invalid WebSocket message received",
        details: "The game sent a message that doesn't conform to the API specification"
    },
    {
        key: "perf/register/identical_duplicate",
        severity: DiagnosticSeverity.Info,
        message: "Identical action re-registered",
        details: "The incoming action is identical to an already-registered one. This is harmless but redundant.",
    },
    {
        key: "prot/v1/register/conflict",
        severity: DiagnosticSeverity.Warning,
        message: "Duplicate action registration conflict",
        details: `An action with this name is already registered.
Per v1 of the API specification, the incoming action is ignored and the existing is kept; this may not be the behaviour you expected or intended.`,
    },
    {
        key: "prot/unregister/unknown",
        severity: DiagnosticSeverity.Warning,
        message: "Unregistered unknown action",
        details: "The action was never registered. This may indicate a serious error or state desync (e.g. forgetting to re-register actions after a reconnect)."
    },
    {
        key: "prot/unregister/inactive",
        severity: DiagnosticSeverity.Info,
        message: "Pointless unregister",
        details: "Unregistering an action that's already unregistered is harmless, but you should still aim to reduce duplicate calls.",
    },
    {
        key: "prot/force/empty",
        severity: DiagnosticSeverity.Error,
        message: "Empty actions/force",
        details: "Sent 'actions/force' with no actions",
    },
    {
        key: "prot/force/some_invalid",
        severity: DiagnosticSeverity.Warning,
        message: "Partially invalid actions/force",
        details: "Not all actions were known/registered"
    },
    {
        key: "prot/force/all_invalid",
        severity: DiagnosticSeverity.Error,
        message: "Entirely invalid actions/force",
        details: "Sent an actions/force where none of the actions were registered.",
    },
    {
        key: "prot/force/multiple",
        severity: DiagnosticSeverity.Error,
        message: "Multiple actions/force at once",
        details: "Neuro can only handle one action force at a time.",
    },
    {
        key: "prot/force/while_pending_result",
        severity: DiagnosticSeverity.Error,
        message: "Cannot process actions/force while waiting for an action result",
        details: `Make sure you send action results as soon as possible.\n${asyncResultNag}`
    },
    {
        key: "prot/v1/game_renamed",
        severity: DiagnosticSeverity.Warning,
        message: "Do not rename game",
        details: "The protocol forbids changing your game name mid-connection."
    },
    {
        key: "prot/startup/missing",
        severity: DiagnosticSeverity.Warning,
        message: "Missing startup message",
        details: "The first message sent must be a 'startup' message"
    },
    {
        key: "prot/startup/multiple",
        severity: DiagnosticSeverity.Warning,
        message: "Multiple startup messages",
        details: "Don't send more than one 'startup' message as it may reset Neuro's state."
    },
    {
        key: "perf/late/startup",
        severity: DiagnosticSeverity.Info,
        message: "Late startup",
        details: "The game should send a 'startup' message as soon as possible."
    },
    {
        key: "perf/late/action_result",
        severity: DiagnosticSeverity.Warning,
        message: "Late action result",
        details: `Send action results as soon as possible.\n${asyncResultNag}`
    },
    {
        key: "perf/timeout/action_result",
        severity: DiagnosticSeverity.Error,
        message: "Action result not received",
        details: `The game did not send an action result within a reasonable timeframe.\n${asyncResultNag}`
    },
    {
        key: "prot/result/error_nomessage",
        severity: DiagnosticSeverity.Warning,
        message: "Unsuccessful action result should have message",
        details: "Provide feedback to let Neuro know what went wrong."
    },
    {
        key: "prot/result/unexpected",
        severity: DiagnosticSeverity.Warning,
        message: "Received a result for an action we didn't send",
        details: "This usually indicates stale state on the client side."
    },
    {
        key: "prot/schema/additionalProperties",
        severity: DiagnosticSeverity.Warning,
        message: "Action schema should have 'additionalProperties: false'",
        details: `Action schemas should explicitly set 'additionalProperties: false' to reject unknown fields and prevent bugs from typo'd field names.
If you do want freeform extra fields, you should explicitly set 'additionalProperties: true'.`
    },
] as const satisfies DiagnosticDef[];

export type DiagnosticKey = (typeof DIAGNOSTICS)[number]["key"];

export const DIAGNOSTICS_BY_KEY = Object.fromEntries(
    DIAGNOSTICS.map(d => [d.key, d]) as [DiagnosticKey, DiagnosticDef][]
) as Record<DiagnosticKey, DiagnosticDef>;

export function getDiagnosticDefinition(key: string): DiagnosticDef | undefined {
    return DIAGNOSTICS_BY_KEY[key as DiagnosticKey];
}

export const SeverityToLogLevel: Record<DiagnosticSeverity, LogLevel> = {
    [DiagnosticSeverity.Info]: LogLevel.Info,
    [DiagnosticSeverity.Warning]: LogLevel.Warning,
    [DiagnosticSeverity.Error]: LogLevel.Error,
    [DiagnosticSeverity.Fatal]: LogLevel.Fatal,
}
