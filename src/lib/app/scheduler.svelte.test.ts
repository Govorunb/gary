// @vitest-environment svelte-client
import { describe, expect, test, vi } from "vitest";
import { err, errAsync, okAsync, type Result, ResultAsync } from "neverthrow";
import { Scheduler } from "./scheduler.svelte";
import { EngineError, type Engine, type EngineAct, type EngineActResult } from "./engines/index.svelte";
import type { Action, ActData, ForcePriority } from "#lib/api/v1/spec.js";
import type { ActiveForce, Game } from "#lib/api/game.svelte.js";
import type { Session } from "./session.svelte";
import { Randy, zRandyPrefs, type RandyPrefs } from "./engines/randy.svelte";
import { EVENT_BUS } from "./events/bus";
import type { EventData } from "./events";
import { SelfTestHarness } from "#lib/testing/self-test-harness.js";

type FakeGameAction = Action & { active: boolean };

type FakeGame = {
    id: string;
    name: string;
    shortId: string;
    nextForcePriority: ForcePriority | null;
    activeActions: FakeGameAction[];
    actions: Map<string, FakeGameAction>;
    sentActions: ActData[];
    speechFinishedCount: number;
    getActiveActions(): FakeGameAction[];
    getAction(actionName: string): FakeGameAction | undefined;
    sendAction(actData: ActData): Promise<void>;
    sendSpeechFinished(): Promise<void>;
};

function createFakeGame(name: string, shortId: string, activeActions: Action[]): FakeGame {
    const storedActions = activeActions.map(action => ({ ...action, active: true }));
    const sentActions: ActData[] = [];
    return {
        id: `${shortId}-id`,
        name,
        shortId,
        nextForcePriority: null,
        activeActions: storedActions,
        actions: new Map(storedActions.map(action => [action.name, action])),
        sentActions,
        speechFinishedCount: 0,
        getActiveActions: () => storedActions.filter(action => action.active),
        getAction: (actionName: string) => storedActions.find(action => action.name === actionName),
        sendAction(actData: ActData) {
            sentActions.push(actData);
            return Promise.resolve();
        },
        sendSpeechFinished() {
            this.speechFinishedCount++;
            return Promise.resolve();
        },
    };
}

function createEngine(select: (actions: Action[]) => EngineActResult, allowsUnregisteredActions = false): Engine<unknown> {
    return {
        id: "test-engine",
        allowsUnregisteredActions,
        name: "Test Engine",
        forceAct: vi.fn((_session: Session, actions?: Action[]) => okAsync(select(actions ?? []))),
        tryAct: vi.fn((_session: Session, actions?: Action[]) => okAsync(select(actions ?? []))),
    } as unknown as Engine<unknown>;
}

async function withScheduler(
    games: Array<FakeGame | Game>,
    engine: Engine<unknown>,
    run: (scheduler: Scheduler, acts: EventData<"api/actor/act">[]) => Promise<void> | void,
    prefs: { secrets: string[] } = { secrets: [] },
) {
    const disposeCallbacks: Array<() => void> = [];
    const session = {
        id: "test-session",
        name: "test-session",
        registry: { games },
        userPrefs: { get secrets() { return prefs.secrets; } },
        activeEngine: engine,
        uiState: { aprilFools: false },
        bus: EVENT_BUS,
        live: true,
        onDispose(callback: () => void) {
            disposeCallbacks.push(callback);
            return () => {
                const i = disposeCallbacks.indexOf(callback);
                if (i >= 0) {
                    disposeCallbacks.splice(i, 1);
                }
            };
        },
    } as unknown as Session;

    let scheduler!: Scheduler;
    const disposeRoot = $effect.root(() => {
        scheduler = new Scheduler(session);
    });
    Object.assign(session, { scheduler });
    const acts: EventData<"api/actor/act">[] = [];
    const subscription = EVENT_BUS.subscribe(["api/actor/act"]);
    subscription.onnext(event => acts.push(event.data));

    try {
        await run(scheduler, acts);
    } finally {
        subscription.destroy();
        disposeCallbacks.toReversed().forEach(callback => callback());
        disposeRoot();
    }
}

describe("Scheduler action names", () => {
    test("notifies every game when the engine says something", async () => {
        const firstGame = createFakeGame("First Game", "first", [{ name: "move" }]);
        const secondGame = createFakeGame("Second Game", "second", []);
        const engine = createEngine(() => ({ say: "hello", notify: false }));

        await withScheduler([firstGame, secondGame], engine, async scheduler => {
            const result = await scheduler.tryAct();

            expect(result.isOk()).toBe(true);
            expect(firstGame.speechFinishedCount).toBe(1);
            expect(secondGame.speechFinishedCount).toBe(1);
        });
    });

    test("drains queued work after becoming unmuted", async () => {
        const action = { name: "move", description: "Move" };
        const game = createFakeGame("Test Game", "test", [action]);
        const engine = createEngine(actions => ({ name: actions[0].name }));

        await withScheduler([game], engine, async scheduler => {
            scheduler.toggleMuted();
            scheduler.queueForce([{ game: game as unknown as Game, action }]);
            await Promise.resolve();
            expect(engine.forceAct).not.toHaveBeenCalled();

            scheduler.toggleMuted();
            await vi.waitFor(() => expect(engine.forceAct).toHaveBeenCalledOnce());
        });
    });

    test("passes original action names to engines when names are unique", async () => {
        const jump = { name: "jump", description: "Jump" };
        const duck = { name: "duck", description: "Duck" };
        const firstGame = createFakeGame("First Game", "first1", [jump]);
        const secondGame = createFakeGame("Second Game", "second", [duck]);
        const engine = createEngine(actions => {
            expect(actions.map(action => action.name)).toStrictEqual(["jump", "duck"]);
            return { name: actions[0].name, data: "{\"height\":1}" };
        });

        await withScheduler([firstGame, secondGame], engine, async scheduler => {
            const result = await scheduler.forceAct();

            expect(result.isOk()).toBe(true);
            expect(firstGame.sentActions).toHaveLength(1);
            expect(firstGame.sentActions[0].name).toBe("jump");
            expect(firstGame.sentActions[0].data).toBe("{\"height\":1}");
            expect(secondGame.sentActions).toHaveLength(0);
        });
    });

    test("renames colliding action names for engines and routes back to the selected game", async () => {
        const firstGame = createFakeGame("Alpha", "alpha1", [{ name: "move", description: "Alpha move" }]);
        const secondGame = createFakeGame("Beta", "beta22", [{ name: "move", description: "Beta move" }]);
        const engine = createEngine(actions => {
            const names = actions.map(action => action.name);
            expect(names).toHaveLength(2);
            expect(names).not.toContain("move");
            expect(new Set(names).size).toBe(2);
            expect(names[0]).toContain("Alpha");
            expect(names[0]).toContain("alpha1");
            expect(names[1]).toContain("Beta");
            expect(names[1]).toContain("beta22");
            return { name: names[1], data: "{\"square\":\"e4\"}" };
        });

        await withScheduler([firstGame, secondGame], engine, async scheduler => {
            const result = await scheduler.forceAct();

            expect(result.isOk()).toBe(true);
            expect(firstGame.sentActions).toHaveLength(0);
            expect(secondGame.sentActions).toHaveLength(1);
            expect(secondGame.sentActions[0].name).toBe("move");
            expect(secondGame.sentActions[0].data).toBe("{\"square\":\"e4\"}");
        });
    });

    test("keeps duplicate names stable when the other action unregisters", async () => {
        const firstGame = createFakeGame("Alpha", "alpha1", [{ name: "move" }]);
        const secondGame = createFakeGame("Beta", "beta22", [{ name: "move" }]);
        const seenNames: string[][] = [];
        const engine = createEngine(actions => {
            seenNames.push(actions.map(action => action.name));
            return { name: actions.at(-1)!.name };
        });

        await withScheduler([firstGame, secondGame], engine, async scheduler => {
            expect((await scheduler.tryAct()).isOk()).toBe(true);
            firstGame.activeActions[0].active = false;
            expect((await scheduler.tryAct()).isOk()).toBe(true);
        });

        expect(seenNames).toEqual([["move (Alpha alpha1)", "move (Beta beta22)"], ["move (Beta beta22)"]]);
        expect(secondGame.sentActions.map(action => action.name)).toEqual(["move", "move"]);
    });

    test("keeps a forced game action scoped to its game even when another game has the same action name", async () => {
        const firstMove = { name: "move", description: "Alpha move" };
        const firstGame = createFakeGame("Alpha", "alpha1", [firstMove]);
        const secondGame = createFakeGame("Beta", "beta22", [{ name: "move", description: "Beta move" }]);
        const engine = createEngine(actions => {
            expect(actions.map(action => action.name)).toStrictEqual(["move (Alpha alpha1)"]);
            return { name: actions[0].name, data: "{\"square\":\"a1\"}" };
        });

        await withScheduler([firstGame, secondGame], engine, async scheduler => {
            const result = await scheduler.forceAct([{
                game: firstGame as unknown as Game,
                action: firstMove,
            }]);

            expect(result.isOk()).toBe(true);
            expect(firstGame.sentActions).toHaveLength(1);
            expect(firstGame.sentActions[0].name).toBe("move");
            expect(firstGame.sentActions[0].data).toBe("{\"square\":\"a1\"}");
            expect(secondGame.sentActions).toHaveLength(0);
        });
    });
});

describe("Scheduler force priority", () => {
    test("associates a game force with the action sent for it", async () => {
        const action = { name: "move", description: "Move" };
        const game = createFakeGame("Test Game", "test", [action]) as FakeGame & Game;
        const force: ActiveForce = {
            actions: [action],
            data: { query: "Move now", action_names: [action.name], priority: "low" },
            phase: "generating",
        };
        let queued: ActiveForce | null = force;
        const sendAction = vi.spyOn(game, "sendAction");
        const completeForce = vi.fn();

        Object.defineProperties(game, {
            nextForcePriority: { get: () => queued?.data.priority ?? null },
            takeForce: { value: vi.fn(() => {
                const taken = queued;
                queued = null;
                return taken;
            }) },
            completeForce: { value: completeForce },
        });

        await withScheduler([game], createEngine(actions => ({ name: actions[0].name })), async scheduler => {
            scheduler.onGameForce("low");
            await vi.waitFor(() => expect(sendAction).toHaveBeenCalledOnce());

            expect(sendAction).toHaveBeenCalledWith(expect.objectContaining({ name: action.name }), undefined);
            expect(completeForce).toHaveBeenCalledOnce();
        });
    });

    test("takes the highest-priority force across games", async () => {
        const action = { name: "move", description: "Move" };
        const low = createFakeGame("Low", "low", [action]) as FakeGame & Game;
        const critical = createFakeGame("Critical", "critical", [action]) as FakeGame & Game;
        const queuedForce = (priority: ForcePriority): ActiveForce => ({
            actions: [action],
            data: { query: priority, action_names: [action.name], priority },
            phase: "generating",
        });
        const lowForce = queuedForce("low");
        const criticalForce = queuedForce("critical");

        Object.defineProperties(low, {
            nextForcePriority: { get: () => "low" },
            takeForce: { value: vi.fn(() => lowForce) },
        });
        Object.defineProperties(critical, {
            nextForcePriority: { get: () => "critical" },
            takeForce: { value: vi.fn(() => criticalForce) },
        });

        await withScheduler([low, critical], createEngine(actions => ({ name: actions[0].name })), scheduler => {
            const selected = (scheduler as unknown as {
                takeGameForce(): { game: Game; force: ActiveForce } | null;
            }).takeGameForce();

            expect(selected).toStrictEqual({ game: critical, force: criticalForce });
            expect(low.takeForce).not.toHaveBeenCalled();
            expect(critical.takeForce).toHaveBeenCalledOnce();
        });
    });

    test("interrupts busy inference only for a strictly higher priority", async () => {
        const signals: AbortSignal[] = [];
        const game = createFakeGame("Test Game", "test", [{ name: "wait" }]);
        const engine = {
            id: "blocking-engine",
            name: "Blocking Engine",
            tryAct: vi.fn((_session: Session, _actions?: Action[], signal?: AbortSignal) =>
                new ResultAsync(new Promise<Result<EngineActResult, "cancelled">>(resolve => {
                    signals.push(signal!);
                    signal!.addEventListener("abort", () => resolve(err("cancelled")), { once: true });
                }))
            ),
        } as unknown as Engine<unknown>;

        await withScheduler([game], engine, async scheduler => {
            const acting = scheduler.tryAct();
            expect(scheduler.busy).toBe(true);
            expect(signals).toHaveLength(1);

            scheduler.onGameForce("low");
            expect(signals[0].aborted).toBe(false);

            scheduler.onGameForce("medium");
            expect(signals[0].aborted).toBe(true);
            expect((await acting).isErr()).toBe(true);
            expect(scheduler.busy).toBe(false);
        });
    });
});

describe("Scheduler engine errors", () => {
    test("keeps credentials out of errors, even if they change mid-request", async () => {
        const game = createFakeGame("Test Game", "test", [{ name: "move" }]);
        const prefs = { secrets: ["sk-old"] };
        const engine = {
            id: "failing-engine",
            name: "Failing Engine",
            tryAct: vi.fn(() => {
                prefs.secrets = ["sk-new"];
                return errAsync(new EngineError("Request failed", new Error("401 Invalid API key: sk-old"), false));
            }),
        } as unknown as Engine<unknown>;

        await withScheduler([game], engine, async scheduler => {
            await scheduler.tryAct();
            expect(scheduler.errorReason).toBe("Request failed: 401 Invalid API key: [REDACTED]");
        }, prefs);
    });

    test("pauses after five consecutive recoverable errors", async () => {
        const game = createFakeGame("Test Game", "test", [{ name: "move" }]);
        const engine = {
            id: "failing-engine",
            name: "Failing Engine",
            tryAct: vi.fn(() => errAsync(new EngineError("bad model output"))),
        } as unknown as Engine<unknown>;

        await withScheduler([game], engine, async scheduler => {
            for (let i = 0; i < 4; i++) {
                expect((await scheduler.tryAct()).isErr()).toBe(true);
                expect(scheduler.errored).toBe(false);
            }

            expect((await scheduler.tryAct()).isErr()).toBe(true);
            expect(scheduler.errored).toBe(true);
        });
    });

    test("resets recoverable errors after a successful generation", async () => {
        const game = createFakeGame("Test Game", "test", [{ name: "move" }]);
        const outcomes: Array<EngineAct | EngineError> = [
            new EngineError("bad model output"),
            new EngineError("bad model output"),
            { name: "move" },
            new EngineError("bad model output"),
            new EngineError("bad model output"),
            new EngineError("bad model output"),
            new EngineError("bad model output"),
        ];
        const engine = {
            id: "flaky-engine",
            name: "Flaky Engine",
            tryAct: vi.fn(() => {
                const outcome = outcomes.shift()!;
                return outcome instanceof EngineError ? errAsync(outcome) : okAsync(outcome);
            }),
        } as unknown as Engine<unknown>;

        await withScheduler([game], engine, async scheduler => {
            for (let i = 0; i < 2; i++) {
                expect((await scheduler.tryAct()).isErr()).toBe(true);
            }
            expect((await scheduler.tryAct()).isOk()).toBe(true);
            for (let i = 0; i < 4; i++) {
                expect((await scheduler.tryAct()).isErr()).toBe(true);
            }

            expect(scheduler.errored).toBe(false);
        });
    });

    test("pauses immediately for non-recoverable errors", async () => {
        const game = createFakeGame("Test Game", "test", [{ name: "move" }]);
        const engine = {
            id: "misconfigured-engine",
            name: "Misconfigured Engine",
            tryAct: vi.fn(() => errAsync(new EngineError("invalid configuration", undefined, false))),
        } as unknown as Engine<unknown>;

        await withScheduler([game], engine, async scheduler => {
            expect((await scheduler.tryAct()).isErr()).toBe(true);
            expect(scheduler.errored).toBe(true);
        });
    });
});

function createRandyEngine(options: Partial<RandyPrefs> = {}) {
    return new Randy({ engines: { randy: zRandyPrefs.decode({
        chanceDoNothing: 0, latencyMs: 1, seed: 12345, ...options,
    }) } });
}

describe("Scheduler chaos sends", () => {
    test.each([false, true])("Randy keeps valid actions with chaos disabled, forced=%s", async forced => {
        const game = createFakeGame("Game", "game", [
            { name: "current", schema: { type: "object", properties: { count: { type: "integer" } }, required: ["count"] } },
            { name: "old" },
        ]);
        game.actions.get("old")!.active = false;
        await withScheduler([game], createRandyEngine(), async (scheduler, acts) => {
            const result = await (forced ? scheduler.forceAct() : scheduler.tryAct());
            expect(result.isOk()).toBe(true);
            expect(game.sentActions[0].name).toBe("current");
            expect(acts[0].issues).toEqual([]);
        });
    });

    test.each([false, true])("Randy sends retained inactive actions when enabled, forced=%s", async forced => {
        const game = createFakeGame("Game", "game", [{ name: "current" }, { name: "old" }]);
        game.actions.get("old")!.active = false;
        await withScheduler([game], createRandyEngine({ chanceUnregisteredAction: 1 }), async (scheduler, acts) => {
            const result = await (forced ? scheduler.forceAct() : scheduler.tryAct());
            expect(result.isOk()).toBe(true);
            expect(game.sentActions[0].name).toBe("old");
            expect(acts[0].issues).toEqual(["unregistered"]);
        });
    });

    test("keeps forced stale choices in the source game despite duplicate historical names", async () => {
        const first = createFakeGame("First", "first", [{ name: "current" }, { name: "old" }]);
        const second = createFakeGame("Second", "second", [{ name: "other" }, { name: "old" }]);
        first.actions.get("old")!.active = false;
        second.actions.get("old")!.active = false;
        await withScheduler([first, second], createRandyEngine({ chanceUnregisteredAction: 1 }), async scheduler => {
            const result = await scheduler.forceAct([{ game: first as unknown as Game, action: first.actions.get("current")! }]);
            expect(result.isOk()).toBe(true);
            expect(first.sentActions[0].name).toBe("old");
            expect(second.sentActions).toEqual([]);
        });
    });

    test.each([false, true])("Randy sends JSON that fails the schema when enabled, forced=%s", async forced => {
        const game = createFakeGame("Game", "game", [{
            name: "move", schema: { type: "object", properties: { x: { type: "integer" } }, required: ["x"] },
        }]);
        await withScheduler([game], createRandyEngine({ chanceInvalidData: 1 }), async (scheduler, acts) => {
            expect((await (forced ? scheduler.forceAct() : scheduler.tryAct())).isOk()).toBe(true);
            expect(JSON.parse(game.sentActions[0].data!)).toEqual({});
            expect(acts[0].issues).toEqual(["invalid data"]);
        });
    });

    test("reports an action unregistered while Randy holds its choice", async () => {
        vi.useFakeTimers();
        const game = createFakeGame("Game", "game", [{ name: "move" }]);
        try {
            await withScheduler([game], createRandyEngine({ latencyMs: 1000 }), async (scheduler, acts) => {
                const acting = scheduler.forceAct();
                await vi.advanceTimersByTimeAsync(500);
                expect(game.sentActions).toEqual([]);
                game.actions.get("move")!.active = false;
                await vi.advanceTimersByTimeAsync(500);
                expect((await acting).isOk()).toBe(true);
                expect(game.sentActions[0].name).toBe("move");
                expect(acts[0].issues).toEqual(["unregistered"]);
                expect(acts[0].metrics.latencyMs).toBe(1000);
            });
        } finally {
            vi.useRealTimers();
        }
    });

    test("cancels held choices without sending or reporting an act", async () => {
        vi.useFakeTimers();
        const game = createFakeGame("Game", "game", [{ name: "move" }]);
        try {
            await withScheduler([game], createRandyEngine({ latencyMs: 1000 }), async (scheduler, acts) => {
                const acting = scheduler.forceAct();
                await vi.advanceTimersByTimeAsync(500);
                expect(scheduler.cancelAct()).toBe(true);
                expect((await acting)._unsafeUnwrapErr()).toBe("cancelled");
                await vi.advanceTimersByTimeAsync(1000);
                expect(game.sentActions).toEqual([]);
                expect(acts).toEqual([]);
            });
        } finally {
            vi.useRealTimers();
        }
    });

    test("routes a made-up name only when enabled and one game can receive it", async () => {
        const game = createFakeGame("Game", "game", [{ name: "move" }]);
        await withScheduler([game], createEngine(() => ({ name: "invented" }), false), async scheduler => {
            expect((await scheduler.tryAct()).isErr()).toBe(true);
            expect(game.sentActions).toEqual([]);
        });
        await withScheduler([game], createEngine(() => ({ name: "invented" }), true), async scheduler => {
            expect((await scheduler.tryAct()).isOk()).toBe(true);
            expect(game.sentActions[0].name).toBe("invented");
        });
    });

    test("rejects ambiguous historical names and unknown names across games", async () => {
        const first = createFakeGame("First", "first", [{ name: "move" }, { name: "old" }]);
        const second = createFakeGame("Second", "second", [{ name: "jump" }, { name: "old" }]);
        first.actions.get("old")!.active = false;
        second.actions.get("old")!.active = false;
        for (const name of ["old", "invented"]) {
            await withScheduler([first, second], createEngine(() => ({ name }), true), async scheduler => {
                expect((await scheduler.tryAct()).isErr()).toBe(true);
                expect(first.sentActions).toEqual([]);
                expect(second.sentActions).toEqual([]);
            });
        }
    });

    test("keeps stale choices across game-force retries", async () => {
        const harness = new SelfTestHarness();
        try {
            const receive = async () => {
                for await (const text of harness.client.conn.listen()) await harness.client.recvRaw(text);
            };
            void receive();
            await harness.connect();
            await harness.client.hello();
            await harness.client.registerActions([{ name: "current", description: "Current menu" }, { name: "old", description: "Old menu" }]);
            await harness.client.unregisterActions(["old"]);
            const run = vi.spyOn(harness.client, "runAction").mockResolvedValue({ success: false, message: "That action is unavailable" });
            await withScheduler([harness.server], createRandyEngine({ chanceUnregisteredAction: 1 }), async (scheduler, acts) => {
                Object.assign(harness.session, { scheduler });
                await harness.client.sendForce(["current"], "Choose from this menu");
                await vi.waitFor(() => {
                    expect(run).toHaveBeenCalledTimes(4);
                    expect(harness.server.hasForce).toBe(false);
                    expect(scheduler.busy).toBe(false);
                });
                expect(run.mock.calls.every(([name]) => name === "old")).toBe(true);
                expect(acts).toHaveLength(4);
                expect(acts.every(act => act.issues.includes("unregistered"))).toBe(true);
                expect(harness.diagnosticKeys).toEqual([]);
            });
        } finally {
            await harness.dispose();
        }
    });

    test("rejects a known action belonging to a different game's force", async () => {
        const first = createFakeGame("First", "first", [{ name: "move" }]);
        const second = createFakeGame("Second", "second", [{ name: "old" }]);
        second.actions.get("old")!.active = false;
        await withScheduler([first, second], createEngine(() => ({ name: "old" }), true), async scheduler => {
            expect((await scheduler.forceAct([{ game: first as unknown as Game, action: first.actions.get("move")! }])).isErr()).toBe(true);
            expect(first.sentActions).toEqual([]);
            expect(second.sentActions).toEqual([]);
        });
    });
});
