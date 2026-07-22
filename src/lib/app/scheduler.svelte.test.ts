import { describe, expect, test, vi } from "vitest";
import { err, okAsync, type Result, ResultAsync } from "neverthrow";
import { Scheduler } from "./scheduler.svelte";
import type { Engine, EngineAct, EngineActResult } from "./engines/index.svelte";
import type { Action, ActData, ForcePriority } from "$lib/api/v1/spec";
import type { Game, QueuedGameForce } from "$lib/api/game.svelte";
import type { Session } from "./session.svelte";

type FakeGameAction = Action & { active: boolean };

type FakeGame = {
    id: string;
    name: string;
    shortId: string;
    activeActions: FakeGameAction[];
    sentActions: ActData[];
    getActiveActions(): FakeGameAction[];
    getAction(actionName: string): FakeGameAction | undefined;
    sendAction(actData: ActData): Promise<void>;
};

function createFakeGame(name: string, shortId: string, activeActions: Action[]): FakeGame {
    const storedActions = activeActions.map(action => ({ ...action, active: true }));
    const sentActions: ActData[] = [];
    return {
        id: `${shortId}-id`,
        name,
        shortId,
        activeActions: storedActions,
        sentActions,
        getActiveActions: () => storedActions,
        getAction: (actionName: string) => storedActions.find(action => action.name === actionName),
        sendAction(actData: ActData) {
            sentActions.push(actData);
            return Promise.resolve();
        },
    };
}

function createEngine(select: (actions: Action[]) => EngineAct): Engine<unknown> {
    return {
        id: "test-engine",
        name: "Test Engine",
        forceAct: vi.fn((_session: Session, actions?: Action[]) => okAsync(select(actions ?? []))),
        tryAct: vi.fn((_session: Session, actions?: Action[]) => okAsync(select(actions ?? []))),
    } as unknown as Engine<unknown>;
}

async function withScheduler(
    games: FakeGame[],
    engine: Engine<unknown>,
    run: (scheduler: Scheduler) => Promise<void> | void,
) {
    const disposeCallbacks: Array<() => void> = [];
    const session = {
        id: "test-session",
        name: "test-session",
        registry: { games },
        activeEngine: engine,
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

    const scheduler = new Scheduler(session);

    try {
        await run(scheduler);
    } finally {
        disposeCallbacks.toReversed().forEach(callback => callback());
    }
}

describe("Scheduler action names", () => {
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

    test("keeps a forced game action scoped to its game even when another game has the same action name", async () => {
        const firstMove = { name: "move", description: "Alpha move" };
        const firstGame = createFakeGame("Alpha", "alpha1", [firstMove]);
        const secondGame = createFakeGame("Beta", "beta22", [{ name: "move", description: "Beta move" }]);
        const engine = createEngine(actions => {
            expect(actions.map(action => action.name)).toStrictEqual(["move"]);
            return { name: "move", data: "{\"square\":\"a1\"}" };
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
    test("takes the highest-priority force across games", async () => {
        const action = { name: "move", description: "Move" };
        const low = createFakeGame("Low", "low", [action]) as FakeGame & Game;
        const critical = createFakeGame("Critical", "critical", [action]) as FakeGame & Game;
        const queuedForce = (priority: ForcePriority): QueuedGameForce => ({
            actions: [action],
            data: { query: priority, action_names: [action.name], priority },
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
                takeGameForce(): { game: Game; force: QueuedGameForce } | null;
            }).takeGameForce();

            expect(selected).toStrictEqual({ game: critical, force: criticalForce });
            expect(low.takeForce).not.toHaveBeenCalled();
            expect(critical.takeForce).toHaveBeenCalledOnce();
        });
    });

    test("interrupts busy inference only for a strictly higher priority", async () => {
        const signals: AbortSignal[] = [];
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

        await withScheduler([], engine, async scheduler => {
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
