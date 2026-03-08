import type { UnwrapZod } from "$lib/app/utils";
import type z from "zod";
import type * as v1 from "./v1/spec";

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
    contextSchema?: z.ZodType | any;
}

export type GameDiagnostics = {
    [K in DiagnosticKey]: {
        id: string; // unique id for ui (key:timestamp was not unique enough)
        timestamp: number;
        key: K;
        context: DiagData<K>;
        dismissed?: boolean;
    }
}[DiagnosticKey];

export type GameDiagnostic<K extends DiagnosticKey> = Extract<GameDiagnostics, { key: K }>;

export const TIMEOUTS = {
    "perf/late/startup": 500,
    "perf/late/action_result": 500,
    "perf/timeout/action_result": 5000,
} as const satisfies {
    [K in DiagnosticKey]?: number;
};

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
        description: "The game sent a message that doesn't conform to the API specification",
        contextSchema: {} as { message: string, error: string },
    },
    {
        key: "perf/register/identical_duplicate",
        severity: DiagnosticSeverity.Info,
        title: "Identical action re-registered",
        description: "The incoming action is identical to an already-registered one. This is harmless but redundant.",
        contextSchema: {} as { action: string },
    },
    {
        key: "prot/v1/register/conflict",
        severity: DiagnosticSeverity.Warning,
        title: "Duplicate action registration conflict",
        description: `An action with this name is already registered.
Per v1 of the API specification, the incoming action is ignored and the existing is kept; this may not be the behaviour you expected or intended.`,
        contextSchema: {} as { incoming: v1.Action, existing: v1.Action },
    },
    {
        key: "prot/unregister/unknown",
        severity: DiagnosticSeverity.Warning,
        title: "Unregistered unknown action",
        description: "The action was never registered. This may indicate a serious error or state desync (e.g. forgetting to re-register actions after a reconnect).",
        contextSchema: {} as { action_name: string },
    },
    {
        key: "prot/unregister/inactive",
        severity: DiagnosticSeverity.Info,
        title: "Pointless unregister",
        description: "Unregistering an action that's already unregistered is harmless, but you should still aim to reduce duplicate calls.",
        contextSchema: {} as { action_name: string },
    },
    {
        key: "prot/force/empty",
        severity: DiagnosticSeverity.Error,
        title: "Empty actions/force",
        description: "Sent 'actions/force' with no actions",
        contextSchema: {} as { msgData: v1.ForceAction["data"] },
    },
    {
        key: "prot/force/some_invalid",
        severity: DiagnosticSeverity.Warning,
        title: "Partially invalid actions/force",
        description: "Not all actions were known/registered",
        contextSchema: {} as { msgData: v1.ForceAction["data"], unknownActions: string[] },
    },
    {
        key: "prot/force/all_invalid",
        severity: DiagnosticSeverity.Error,
        title: "Entirely invalid actions/force",
        description: "Sent an actions/force where none of the actions were registered.",
        contextSchema: {} as { msgData: v1.ForceAction["data"] },
    },
    {
        key: "prot/force/multiple",
        severity: DiagnosticSeverity.Error,
        title: "Multiple actions/force at once",
        description: "Neuro can only handle one action force at a time.",
        contextSchema: {} as { msgData: v1.ForceAction["data"] },
    },
    {
        key: "prot/force/while_pending_result",
        severity: DiagnosticSeverity.Error,
        title: "Cannot process actions/force while waiting for an action result",
        description: `Make sure you send action results as soon as possible.\n${asyncResultNag}`,
        contextSchema: {} as { pending: { act: v1.ActData, sentAt: string }[], msg: v1.ForceAction },
    },
    {
        key: "prot/v1/game_renamed",
        severity: DiagnosticSeverity.Error,
        title: "Do not rename game",
        description: "The protocol forbids changing your game name mid-connection.",
        contextSchema: {} as { old: string, new: string },
    },
    {
        key: "prot/startup/missing",
        severity: DiagnosticSeverity.Warning,
        title: "Missing startup message",
        description: "The first message sent must be a 'startup' message.",
        contextSchema: {} as { firstMessage: { msg: v1.GameMessage } },
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
        description: "The game should send a 'startup' message as soon as possible.",
        contextSchema: {} as { delayMs: number },
    },
    {
        key: "perf/late/action_result",
        severity: DiagnosticSeverity.Warning,
        title: "Late action result",
        description: `Send action results as soon as possible.\n${asyncResultNag}`,
        contextSchema: {} as { act: v1.ActData, sentAt: string },
    },
    {
        key: "perf/timeout/action_result",
        severity: DiagnosticSeverity.Error,
        title: "Action result not received",
        description: `The game did not send an action result within a reasonable timeframe.\n${asyncResultNag}`,
        contextSchema: {} as { act: v1.ActData, sentAt: string },
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
        description: "This usually indicates stale state on the client side.",
        contextSchema: {} as { msgData: v1.ActionResult["data"] },
    },
    {
        key: "prot/schema/additionalProperties",
        severity: DiagnosticSeverity.Warning,
        title: "Action schema should have 'additionalProperties: false'",
        description: `Action schemas should explicitly set 'additionalProperties: false' to reject unknown fields and prevent bugs from typo'd field names.
If you do want freeform extra fields, you should explicitly set 'additionalProperties: true'.`,
        contextSchema: {} as { action: string, schema: v1.Action["schema"] },
    },
    {
        key: "prot/schema/prefer_omit_to_empty",
        severity: DiagnosticSeverity.Warning,
        title: "Prefer omitting schema field for parameterless actions",
        description: `An empty object - "{}" - is specified as valid in the API for parameterless actions. However, as a JSON Schema, it allows ANY input.
LLMs may end up generating unconstrained, possibly filling objects with garbage random parameters and costing you time and/or money.
This is very likely not what you want. You should omit the schema field entirely instead.`,
        contextSchema: {} as { action: string },
    },
    {
        key: "prot/schema/type_object",
        severity: DiagnosticSeverity.Warning,
        title: "Root schema object should contain \"type\": \"object\"",
        description: `The Neuro API spec requires top-level schemas to be constrained to objects.
Randy supports all top-level types, so you may not experience errors; however, some LLM providers may share the requirement.
This will become an error in the future.`,
        contextSchema: {} as { action: string, schema: v1.Action["schema"] },
    },
    {
        key: "prot/action/no_desc",
        severity: DiagnosticSeverity.Warning,
        title: "Action missing description",
        description: "Action descriptions are required by the Neuro API spec. Please add a description to let Neuro know what the action does.",
        contextSchema: {} as { action: string },
    },
    {
        key: "prot/schema/unsupported_keywords",
        severity: DiagnosticSeverity.Warning,
        title: "Unsupported keywords in action schema",
        description: `Complex and uncommon keywords may make Neuro perform worse.
In Gary, unsupported keywords may be rejected (or worse, ignored) by inference providers during constrained generation.
This can be insidious, as the LLM may sometimes happen to comply with the schema - but it will likely be inconsistent.
Clients should always validate action data.`,
        contextSchema: {} as { action: string, keywords: string[] },
    },
    {
        // TODO for things like complex enum members
        // (`"enum": ["str", 5, {"object": "yep that's allowed"}, ["arrays", "too"]])`)
        // perf/schema/confusing/complex_enum_member
        // perf/schema/confusing/...
        key: "perf/schema/confusing",
        severity: DiagnosticSeverity.Info,
        title: "Confusing action schema",
        description: `Action schemas should be easy to understand. Please avoid uncommon and confusing patterns.`,
    }
] as const satisfies DiagnosticDef[];

export type Diagnostics = typeof DIAGNOSTICS[number];
export type DiagnosticKey = Diagnostics["key"];

export type DiagnosticByKey<K extends DiagnosticKey> = Extract<Diagnostics, { key: K }>;

export const DIAGNOSTICS_BY_KEY = Object.fromEntries(
    DIAGNOSTICS.map(d => [d.key, d]) as [DiagnosticKey, DiagnosticDef][]
) as { [K in DiagnosticKey]: DiagnosticByKey<K> };

export type DiagData<K extends DiagnosticKey> = 'contextSchema' extends keyof DiagnosticByKey<K>
    ? UnwrapZod<DiagnosticByKey<K>['contextSchema']>
    : never;
