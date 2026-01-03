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
    title: string;
    description?: string;
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
        title: "Test diagnostic (info)",
        description: "You're really testing me, you know that?",
    },
    {
        key: "misc/test/warn",
        severity: DiagnosticSeverity.Warning,
        title: "Test diagnostic (warn)",
        description: "The next one... well... don't say I didn't warn you.",
    },
    {
        key: "misc/test/error",
        severity: DiagnosticSeverity.Error,
        title: "Test diagnostic (error)",
        description: "You failed to comprehend the nature of the attack!",
    },
    {
        key: "prot/invalid_message",
        severity: DiagnosticSeverity.Error,
        title: "Invalid WebSocket message received",
        description: "The game sent a message that doesn't conform to the API specification"
    },
    {
        key: "perf/register/identical_duplicate",
        severity: DiagnosticSeverity.Info,
        title: "Identical action re-registered",
        description: "The incoming action is identical to an already-registered one. This is harmless but redundant.",
    },
    {
        key: "prot/v1/register/conflict",
        severity: DiagnosticSeverity.Warning,
        title: "Duplicate action registration conflict",
        description: `An action with this name is already registered.
Per v1 of the API specification, the incoming action is ignored and the existing is kept; this may not be the behaviour you expected or intended.`,
    },
    {
        key: "prot/unregister/unknown",
        severity: DiagnosticSeverity.Warning,
        title: "Unregistered unknown action",
        description: "The action was never registered. This may indicate a serious error or state desync (e.g. forgetting to re-register actions after a reconnect)."
    },
    {
        key: "prot/unregister/inactive",
        severity: DiagnosticSeverity.Info,
        title: "Pointless unregister",
        description: "Unregistering an action that's already unregistered is harmless, but you should still aim to reduce duplicate calls.",
    },
    {
        key: "prot/force/empty",
        severity: DiagnosticSeverity.Error,
        title: "Empty actions/force",
        description: "Sent 'actions/force' with no actions",
    },
    {
        key: "prot/force/some_invalid",
        severity: DiagnosticSeverity.Warning,
        title: "Partially invalid actions/force",
        description: "Not all actions were known/registered"
    },
    {
        key: "prot/force/all_invalid",
        severity: DiagnosticSeverity.Error,
        title: "Entirely invalid actions/force",
        description: "Sent an actions/force where none of the actions were registered.",
    },
    {
        key: "prot/force/multiple",
        severity: DiagnosticSeverity.Error,
        title: "Multiple actions/force at once",
        description: "Neuro can only handle one action force at a time.",
    },
    {
        key: "prot/force/while_pending_result",
        severity: DiagnosticSeverity.Error,
        title: "Cannot process actions/force while waiting for an action result",
        description: `Make sure you send action results as soon as possible.\n${asyncResultNag}`
    },
    {
        key: "prot/v1/game_renamed",
        severity: DiagnosticSeverity.Warning,
        title: "Do not rename game",
        description: "The protocol forbids changing your game name mid-connection."
    },
    {
        key: "prot/startup/missing",
        severity: DiagnosticSeverity.Warning,
        title: "Missing startup message",
        description: "The first message sent must be a 'startup' message"
    },
    {
        key: "prot/startup/multiple",
        severity: DiagnosticSeverity.Warning,
        title: "Multiple startup messages",
        description: "Don't send more than one 'startup' message as it may reset Neuro's state."
    },
    {
        key: "perf/late/startup",
        severity: DiagnosticSeverity.Info,
        title: "Late startup",
        description: "The game should send a 'startup' message as soon as possible."
    },
    {
        key: "perf/late/action_result",
        severity: DiagnosticSeverity.Warning,
        title: "Late action result",
        description: `Send action results as soon as possible.\n${asyncResultNag}`
    },
    {
        key: "perf/timeout/action_result",
        severity: DiagnosticSeverity.Error,
        title: "Action result not received",
        description: `The game did not send an action result within a reasonable timeframe.\n${asyncResultNag}`
    },
    {
        key: "prot/result/error_nomessage",
        severity: DiagnosticSeverity.Warning,
        title: "Unsuccessful action result should have message",
        description: "Provide feedback to let Neuro know what went wrong."
    },
    {
        key: "prot/result/unexpected",
        severity: DiagnosticSeverity.Warning,
        title: "Received a result for an action we didn't send",
        description: "This usually indicates stale state on the client side."
    },
    {
        key: "prot/schema/additionalProperties",
        severity: DiagnosticSeverity.Warning,
        title: "Action schema should have 'additionalProperties: false'",
        description: `Action schemas should explicitly set 'additionalProperties: false' to reject unknown fields and prevent bugs from typo'd field names.
If you do want freeform extra fields, you should explicitly set 'additionalProperties: true'.`
    },
    {
        key: "prot/schema/prefer_omit_to_empty",
        severity: DiagnosticSeverity.Warning,
        title: "Prefer omitting schema field for parameterless actions",
        description: `An empty object - "{}" - is specified as valid in the API for parameterless actions. However, as a JSON Schema, it allows ANY input.
LLMs may end up generating unconstrained, possibly filling objects with garbage random parameters and costing you time and/or money.
This is very likely not what you want. You should register actions without a schema field instead.`
    },
    {
        key: "prot/schema/type_object",
        severity: DiagnosticSeverity.Info,
        title: "Root schema object should contain \"type\": \"object\"",
        description: `The Neuro API spec requires top-level schemas to be constrained to objects.
Randy supports all top-level types, so you may not experience errors; however, some LLM providers may share the requirement.
Use your judgment.`
    },
    {
        key: "prot/schema/unsupported_keywords",
        severity: DiagnosticSeverity.Warning,
        title: "Unsupported keywords in action schema",
        description: "TODO"
    }
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
