import z from "zod";
import { v4 as uuid } from "uuid";
import { err, ok, Result } from "neverthrow";
import { createEngine, engineSettingsSchema } from "../engines/create";
import { engineActionSet } from "../engines/actions";
import type { Engine, EngineActResult, EngineContext, EnginePrefs } from "../engines/index.svelte";
import { EventBus } from "../events/bus";
import type { EventInstance } from "../events";
import { hasSensitiveSchemaField, scrubSecrets, sensitiveStrings } from "../events/sensitive";
import type { UserPrefs } from "../prefs.svelte";
import { Session, type SessionEvents } from "../session.svelte";
import { parseJson, sessionJson, zSessionFile } from "../session-file";
import { snapshotState } from "../utils";
import { zEvalProfile, type Decision, type EvalProfile } from "./decision";

type DecisionEvent = EventInstance<"app/scheduler/decision">;

/** A session up to the decision it ends with, and the engines to ask it again. */
export const zDecisionDoc = zSessionFile.extend({
    engines: z.array(zEvalProfile).min(1),
}).superRefine((doc, ctx) => {
    if (doc.events.at(-1)?.key !== "app/scheduler/decision") {
        ctx.addIssue({ code: "custom", path: ["events"], message: "The last event must be the decision to evaluate" });
    }
    if (new Set(doc.engines.map(engine => engine.id)).size !== doc.engines.length) {
        ctx.addIssue({ code: "custom", path: ["engines"], message: "Engine IDs must be unique" });
    }
});
export type DecisionDoc = z.infer<typeof zDecisionDoc>;

function decisionDoc(events: SessionEvents, decision: DecisionEvent): DecisionDoc {
    return { version: 1, events: [...events, decision], engines: [decision.data.engine] };
}

/** The newest decision at or before `eventId` (or the newest of all), with everything that led to it. */
export function lastDecision(session: Session, eventId?: string): DecisionDoc | null {
    const [created, ...rest] = session.forkEvents();
    const end = eventId === undefined ? rest.length : rest.findIndex(event => event.id === eventId) + 1;
    for (let i = end - 1; i >= 0; i--) {
        const event = rest[i];
        if (event.key === "app/scheduler/decision") return decisionDoc([created, ...rest.slice(0, i)], event);
    }
    return null;
}

/** The decision the active engine would face now. */
export function currentDecision(session: Session): DecisionDoc {
    const decision = { id: uuid(), timestamp: Date.now(), key: "app/scheduler/decision", data: session.scheduler.decision() } as const;
    return decisionDoc(session.forkEvents(), decision);
}

export function parseDecision(text: string) {
    return parseJson(zDecisionDoc, text);
}

export function decisionJson(doc: DecisionDoc, secrets: readonly string[]): string {
    return sessionJson(doc, secrets);
}

export type Trial = {
    engineId: string;
    result: EngineActResult | { error: string };
    latencyMs: number;
    tokens?: number;
    cost?: number;
};

/** What the engine is given in a trial: the fork's context and catalog, with the decision's prompt. */
export function trialInput(fork: Session, decision: Decision) {
    const games = fork.registry.games;
    const selected = [];
    for (const { gameId, name } of decision.selection) {
        const game = games.find(game => game.id === gameId);
        const action = game?.actions.get(name);
        if (!game || !action) return err(`Selected action '${name}' has no game definition`);
        selected.push({ game, action });
    }
    const source: EngineContext = {
        context: fork.context, registry: fork.registry,
        userPrefs: { app: { systemPrompt: decision.systemPrompt } },
        uiState: { aprilFools: false },
    };
    return ok({ source, actions: engineActionSet(games, selected).actions });
}

export function evalSettings(profile: EvalProfile, configured: EnginePrefs): Result<EnginePrefs, string> {
    if (!Object.hasOwn(configured.engines, profile.id)) return err(`Configure the engine '${profile.name}' locally before running it`);
    const live = configured.engines[profile.id] as Record<string, unknown>;
    const schema = engineSettingsSchema(profile.id);
    const settings = snapshotState(profile.settings);
    // Credentials and endpoints always come from the matching local profile, never imported JSON.
    for (const [key, field] of Object.entries(schema.shape)) {
        if (hasSensitiveSchemaField(field)) settings[key] = live[key];
    }
    const parsed = schema.safeParse(settings);
    if (!parsed.success) return err(`${profile.name}: ${parsed.error.message}`);
    return ok({ engines: { [profile.id]: parsed.data } });
}

/**
 * Asks each engine the decision `count` times. Every trial runs on a fresh fork of the session before the decision,
 * so nothing a trial adds to context carries over. Each engine keeps one instance across its trials for its RNG sequence and token calibration.
 * Sequential trials keep the cache prefix warm and let Stop bound the remaining spend.
 */
export async function runDecision(
    doc: DecisionDoc,
    prefs: UserPrefs,
    count: number,
    signal: AbortSignal,
    onTrial: (trial: Trial) => void,
    factory: (prefs: EnginePrefs, id: string, bus: EventBus) => Engine<unknown> = createEngine,
): Promise<Result<void, string>> {
    const settings = Result.combine(doc.engines.map(profile => evalSettings(profile, prefs)));
    if (settings.isErr()) return err(settings.error);
    const [created, ...rest] = doc.events;
    const events: SessionEvents = [created, ...rest.slice(0, -1)];
    const decision = (doc.events.at(-1) as DecisionEvent).data;
    for (const [index, profile] of doc.engines.entries()) {
        const bus = new EventBus();
        const engine = factory(settings.value[index], profile.id, bus);
        // provider errors can quote the credentials they were sent
        const secrets = sensitiveStrings(engineSettingsSchema(profile.id), settings.value[index].engines[profile.id]);
        for (let trial = 0; trial < count && !signal.aborted; trial++) {
            const fork = new Session("eval", prefs, { events, bus });
            const input = trialInput(fork, decision);
            if (input.isErr()) {
                fork.dispose();
                return err(input.error);
            }
            let tokens: number | undefined;
            let cost: number | undefined;
            const usage = fork.eventLog.subscribe(["app/engines/llm/response"], ({ event }) => {
                const response = event.data.response;
                if ("error" in response) return;
                const u = response.value.usage as { total_tokens?: number; cost?: number } | undefined;
                if (typeof u?.total_tokens === "number") tokens = (tokens ?? 0) + u.total_tokens;
                if (typeof u?.cost === "number") cost = (cost ?? 0) + u.cost;
            });
            const start = Date.now();
            const { source, actions } = input.value;
            const result = decision.force
                ? await engine.forceAct(source, actions, signal, decision.forceContext)
                : await engine.tryAct(source, actions, signal);
            usage();
            fork.dispose();
            if (signal.aborted) break;
            onTrial({
                engineId: profile.id,
                result: result.isOk() ? result.value : { error: result.error === "cancelled" ? "Cancelled" : scrubSecrets(result.error.message, secrets) },
                latencyMs: Date.now() - start, tokens, cost,
            });
        }
    }
    return ok();
}

export function distribution(trials: Trial[]) {
    type Group = { engineId: string; label: string; kind: string; count: number; variants: Map<string, number> };
    const groups = new Map<string, Group>();
    for (const trial of trials) {
        const result = trial.result;
        const [kind, label] = result === "skip" ? ["skip", "Skipped"]
            : "error" in result ? ["error", result.error]
            : "say" in result ? ["say", "Spoke"] : ["action", result.name];
        const key = JSON.stringify([trial.engineId, kind, label]);
        const group = groups.get(key) ?? { engineId: trial.engineId, label, kind, count: 0, variants: new Map<string, number>() };
        group.count++;
        if (typeof result === "object" && "name" in result && result.data != null) {
            group.variants.set(result.data, (group.variants.get(result.data) ?? 0) + 1);
        }
        groups.set(key, group);
    }
    return [...groups.values()].map(({ variants, ...group }) => ({
        ...group, variants: [...variants].map(([data, count]) => ({ data, count })),
    }));
}
