// @vitest-environment svelte-client
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ok, okAsync } from "neverthrow";
import { tick } from "svelte";
import * as v1 from "#lib/api/v1/spec.js";
import { LLMEngine, type LLMRequest } from "../engines/llm";
import { zOpenAIPrefs, type OpenAIPrefs } from "../engines/llm/openai.svelte";
import { zRandyPrefs } from "../engines/randy.svelte";
import { EVENT_BUS } from "../events/bus";
import type { EventInstance, EventKey } from "../events";
import { UserPrefs, zUserPrefs } from "../prefs.svelte";
import { Session } from "../session.svelte";
import type { EvalProfile } from "./decision";
import { currentDecision, decisionJson, distribution, lastDecision, parseDecision, runDecision, type DecisionDoc, type Trial } from "./runner";

let prefs: UserPrefs;
let cleanup: () => void;
beforeEach(async () => {
    vi.stubGlobal("localStorage", { setItem: vi.fn() });
    cleanup = $effect.root(() => { prefs = new UserPrefs(ok(zUserPrefs.decode({ version: "test" }))); });
    await tick(); // the first save isn't part of a test
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const GAME = { id: "game-1", name: "Chess" };
const MOVE = v1.zAction.decode({ name: "move", description: "Move a piece" });
let nextId = 0;
function event<K extends EventKey>(key: K, data: EventInstance<K>["data"]) {
    return { id: `event-${nextId++}`, timestamp: 1000 + nextId, key, data } as EventInstance<EventKey>;
}

function created() {
    return event("app/session/created", { session: { id: "session-1", name: "live" } }) as EventInstance<"app/session/created">;
}

function testProfile(): EvalProfile {
    return { id: "test", name: "Test model", settings: zOpenAIPrefs.decode({
        name: "Test model", modelId: "test", apiKey: "secret", serverUrl: "https://test.invalid/v1",
        promptingStrategy: "tools", modelMetadata: { test: { contextWindow: 6800 } },
    }) };
}

function doc(context = [event("ui/context/input", { text: "Your move", silent: true })], actions = [MOVE]): DecisionDoc {
    const engine = testProfile();
    return {
        version: 1,
        events: [
            created(),
            event("api/registry/game_created", { game: GAME, version: "v1" }),
            event("api/game/register", { game: GAME, actions, newActions: actions.map(a => a.name), stored: actions }),
            ...context,
            event("app/scheduler/decision", {
                engine, force: false, selection: [{ gameId: GAME.id, name: "move" }], systemPrompt: "Play the game.",
            }),
        ],
        engines: [engine],
    };
}

function configure(...profiles: EvalProfile[]) {
    for (const profile of profiles) prefs.engines[profile.id] = structuredClone(profile.settings) as OpenAIPrefs;
    return tick(); // saving prefs isn't part of a run
}

class TestEngine extends LLMEngine<OpenAIPrefs> {
    name = "Test";
    requests: LLMRequest[] = [];
    protected modelId() { return "test"; }
    protected generate(request: LLMRequest) {
        this.requests.push(request);
        return okAsync({ text: "", toolCalls: [{
            id: `call-${this.requests.length}`,
            name: this.requests.length % 2 ? "unknown" : "move",
            arguments: "{}",
        }] });
    }
}

describe("decision evals", () => {
    test("replays the catalog from the log, including edits, into stable aliases", async () => {
        const saved = doc();
        const other = { id: "game-2", name: "Other game" };
        saved.events.splice(3, 0,
            event("api/registry/game_created", { game: other, version: "v1" }),
            event("api/game/register", { game: other, actions: [{ name: "move" }], newActions: ["move"], stored: [{ name: "move" }] }),
            event("api/game/unregister", { game: other, action_names: ["move"] }),
        );
        const register = saved.events[2] as EventInstance<"api/game/register">;
        register.data.stored[0].description = "Changed description";
        await configure(testProfile());
        const parsed = parseDecision(decisionJson(saved, []))._unsafeUnwrap();
        const offered: v1.Action[][] = [];
        await runDecision(parsed, prefs, 1, new AbortController().signal, () => {}, (prefs, id, bus) => {
            const engine = new TestEngine(prefs, id, bus);
            engine.tryAct = (_input, actions) => { offered.push(actions!); return okAsync("skip"); };
            return engine;
        });
        expect(offered[0]).toMatchObject([{ name: "move (Chess game-1)", description: "Changed description" }]);
    });

    test("rejects documents that don't end in a valid decision", async () => {
        const noDecision = doc();
        noDecision.events.pop();
        expect(parseDecision(JSON.stringify(noDecision)).isErr()).toBe(true);
        const badEvent = doc();
        badEvent.events.splice(1, 0, { id: "bad", timestamp: 1, key: "api/game/context", data: {} } as EventInstance<EventKey>);
        expect(parseDecision(JSON.stringify(badEvent)).isErr()).toBe(true);
        const unknownKey = doc();
        unknownKey.events.splice(1, 0, { id: "bad", timestamp: 1, key: "not/an/event", data: {} } as unknown as EventInstance<EventKey>);
        expect(parseDecision(JSON.stringify(unknownKey)).isErr()).toBe(true);
        const noCreation = doc();
        noCreation.events.shift();
        expect(parseDecision(JSON.stringify(noCreation))._unsafeUnwrapErr()).toContain("starts with its creation");
        const missing = doc();
        (missing.events.at(-1) as EventInstance<"app/scheduler/decision">).data.selection[0].name = "missing";
        await configure(testProfile());
        const run = await runDecision(parseDecision(JSON.stringify(missing))._unsafeUnwrap(), prefs, 1, new AbortController().signal, () => {});
        expect(run._unsafeUnwrapErr()).toContain("'missing' has no game definition");
    });

    test("captures the last or current decision from the session's log, never holding credentials", async () => {
        await configure(testProfile());
        prefs.app.selectedEngine = "test";
        // as loaded from a file: profiles lose their credentials on the way in
        const loaded = parseDecision(JSON.stringify(doc()))._unsafeUnwrap();
        expect(loaded.engines[0].settings).toMatchObject({ apiKey: "[REDACTED_STRING]", serverUrl: "[REDACTED_STRING]" });
        const session = new Session("source", prefs, { events: loaded.events });
        try {
            const last = lastDecision(session)!;
            expect(last.events.at(-1)).toBe(session.lastDecision);
            const current = currentDecision(session);
            expect(current.events.at(-2)).toBe(session.lastDecision);
            const decision = current.events.at(-1) as EventInstance<"app/scheduler/decision">;
            expect(decision.data.selection).toEqual([{ gameId: GAME.id, name: "move" }]);
            for (const text of [decisionJson(last, []), decisionJson(current, [])]) {
                expect(text).not.toContain("secret");
                expect(text).not.toContain("https://test.invalid");
                expect(parseDecision(text).isOk()).toBe(true);
            }
            // the log keeps raw provider responses, but a fork doesn't need them
            session.bus.emit("app/engines/llm/response", { reqId: "r1", response: { value: {} } });
            expect(session.eventLog.durable().at(-1)?.key).toBe("app/engines/llm/response");
            expect(currentDecision(session).events.map(event => event.key)).not.toContain("app/engines/llm/response");
        } finally { session.dispose(); }
    });

    test("rejects reused event IDs and games created twice", () => {
        const reusedId = doc();
        reusedId.events[2] = { ...reusedId.events[2], id: reusedId.events[1].id };
        expect(parseDecision(JSON.stringify(reusedId))._unsafeUnwrapErr()).toContain("used twice");
        const twice = doc();
        twice.events.splice(2, 0, { ...twice.events[1], id: "again" });
        expect(parseDecision(JSON.stringify(twice))._unsafeUnwrapErr()).toContain("created twice");
    });

    test("isolates retry feedback and compaction in each trial, with no live actor events", async () => {
        const saved = doc(Array.from({ length: 20 }, (_, index) => event("ui/context/input", {
            text: index < 4 ? (`old-prefix-${index} `).repeat(500) : `live-${index}`, silent: false,
        })));
        const original = structuredClone(saved);
        await configure(testProfile());
        const requests: LLMRequest[] = [];
        const contexts: number[] = [];
        let factories = 0;
        const live = vi.fn();
        const sub = EVENT_BUS.subscribe();
        sub.onnext(live);
        const results: Trial[] = [];
        try {
            const result = await runDecision(saved, prefs, 2, new AbortController().signal, trial => results.push(trial),
                (prefs, id, bus) => {
                    factories++;
                    const engine = new TestEngine(prefs, id, bus);
                    engine.requests = requests;
                    const act = engine.tryAct.bind(engine);
                    engine.tryAct = (input, actions, signal) => {
                        contexts.push(input.context.actorView.length);
                        return act(input, actions, signal);
                    };
                    return engine;
                });
            expect(result.isOk()).toBe(true);
            expect(factories).toBe(1);
            expect(contexts).toEqual([20, 20]);
            expect(results.map(result => result.result)).toEqual([
                { name: "move", data: null, toolCallId: "call-2" },
                { name: "move", data: null, toolCallId: "call-4" },
            ]);
            expect(JSON.stringify(requests[0])).not.toContain("old-prefix");
            expect(JSON.stringify(requests[1])).toContain("unknown");
            expect(requests[2].messages).toEqual(requests[0].messages);
            expect(live).not.toHaveBeenCalled();
            expect(saved).toEqual(original);
        } finally { sub.destroy(); }
    });

    test("uses configured secrets, keeps fallback settings local, and reports usage without network calls", async () => {
        const saved = doc();
        await configure(saved.engines[0]);
        saved.engines[0].settings.apiKey = "imported-secret";
        saved.engines[0].settings.serverUrl = "https://untrusted.invalid/v1";
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "reasoning_effort is mandatory" } }), { status: 400, headers: { "Content-Type": "application/json" } }))
            .mockImplementation(async () => new Response(JSON.stringify({
                id: "completion", object: "chat.completion", created: 1, model: "test",
                choices: [{ index: 0, finish_reason: "tool_calls", message: {
                    role: "assistant", content: null,
                    tool_calls: [{ id: "call", type: "function", function: { name: "move", arguments: "{}" } }],
                } }],
                usage: { total_tokens: 44, cost: 0.001 },
            }), { headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);
        const live = vi.fn();
        const sub = EVENT_BUS.subscribe();
        sub.onnext(live);
        const trials: Trial[] = [];
        try {
            expect((await runDecision(saved, prefs, 2, new AbortController().signal, trial => trials.push(trial))).isOk()).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(3);
            for (const [input, init] of fetchMock.mock.calls) {
                expect(String(input)).toBe("https://test.invalid/v1/chat/completions");
                expect(new Headers(init.headers).get("authorization")).toBe("Bearer secret");
            }
            expect((prefs.engines.test as OpenAIPrefs).reasoningEffort).toBe("auto");
            expect(live).not.toHaveBeenCalled();
            expect(trials.map(trial => [trial.tokens, trial.cost])).toEqual([[44, 0.001], [44, 0.001]]);
        } finally { sub.destroy(); }
    });

    test("keeps the configured key out of trial errors", async () => {
        const saved = doc();
        await configure(saved.engines[0]);
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid API key: secret" } }), { status: 401, headers: { "Content-Type": "application/json" } })));
        const trials: Trial[] = [];
        await runDecision(saved, prefs, 1, new AbortController().signal, trial => trials.push(trial));
        expect(trials).toMatchObject([{ result: { error: expect.stringContaining("Invalid API key: [REDACTED]") } }]);
    });

    test("counts action data variants without mixing actions with other outcomes", () => {
        const trials: Trial[] = [
            { engineId: "test", result: { name: "Error", data: '{"square":"e4"}' }, latencyMs: 1 },
            { engineId: "test", result: { name: "Error", data: '{"square":"e4"}' }, latencyMs: 1 },
            { engineId: "test", result: { name: "Error", data: '{"square":"d4"}' }, latencyMs: 1 },
            { engineId: "test", result: { error: "Unavailable" }, latencyMs: 1 },
        ];
        expect(distribution(trials)).toEqual([
            { engineId: "test", kind: "action", label: "Error", count: 3, variants: [
                { data: '{"square":"e4"}', count: 2 }, { data: '{"square":"d4"}', count: 1 },
            ] },
            { engineId: "test", kind: "error", label: "Unavailable", count: 1, variants: [] },
        ]);
    });

    test("keeps Randy's seeded sequence and stops before more trials start", async () => {
        const saved = doc([], [{ ...MOVE, schema: { type: "integer", minimum: 0, maximum: 1000000 } }]);
        saved.engines = [{ id: "randy", name: "Randy", settings: zRandyPrefs.decode({ seed: 12345, latencyMs: 1, chanceDoNothing: 0 }) }];
        prefs.engines.randy = zRandyPrefs.decode(saved.engines[0].settings);
        const sequence = async () => {
            const trials: Trial[] = [];
            await runDecision(saved, prefs, 4, new AbortController().signal, trial => trials.push(trial));
            return trials;
        };
        const first = await sequence();
        const second = await sequence();
        expect(first.map(trial => trial.result)).toEqual(second.map(trial => trial.result));
        expect(new Set(first.map(trial => JSON.stringify(trial.result))).size).toBeGreaterThan(1);
        const controller = new AbortController();
        const cancelled: Trial[] = [];
        await runDecision(saved, prefs, 10, controller.signal, trial => { cancelled.push(trial); controller.abort(); });
        expect(cancelled).toHaveLength(1);
        expect(distribution(first)).toMatchObject([{ engineId: "randy", label: "move", count: 4 }]);
        expect(distribution(first)[0].variants).toHaveLength(4);
    });
});
