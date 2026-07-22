import { describe, expect, test, vi } from "vitest";
import { errAsync, okAsync } from "neverthrow";
import { Scheduler, LogicError } from "./scheduler.svelte";
import { EngineError, type EngineActResult } from "./engines/index.svelte";
import type { Session } from "./session.svelte";
import type { Action } from "$lib/api/v1/spec";

function createScheduler(choice: EngineActResult = { say: "No games, still here.", notify: false }) {
    const disposers: Array<() => void> = [];
    const engine = {
        id: "test-engine",
        name: "Test Engine",
        tryAct: vi.fn((_session: Session, _actions?: Action[], _signal?: AbortSignal) => okAsync(choice)),
        forceAct: vi.fn((_session: Session, _actions?: Action[], _signal?: AbortSignal) => errAsync(new EngineError("forceAct should not be called"))),
    };
    const session = {
        registry: { games: [] },
        activeEngine: engine,
        onDispose(callback: () => void) {
            disposers.push(callback);
            return () => {
                const i = disposers.indexOf(callback);
                if (i >= 0) {
                    disposers.splice(i, 1);
                }
            };
        },
    } as unknown as Session;
    const scheduler = new Scheduler(session);
    (session as any).scheduler = scheduler;
    return {
        scheduler,
        engine,
        dispose: () => {
            for (const dispose of disposers.splice(0)) {
                dispose();
            }
        },
    };
}

describe("Scheduler no-action acts", () => {
    test("tryAct invokes the active engine with no available actions", async () => {
        const choice = { say: "No games, still here.", notify: false };
        const { scheduler, engine, dispose } = createScheduler(choice);

        const result = await scheduler.tryAct();

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual(choice);
        }
        expect(engine.tryAct).toHaveBeenCalledOnce();
        const [sessionArg, actionsArg, signalArg] = engine.tryAct.mock.calls[0];
        expect(sessionArg).toMatchObject({ activeEngine: engine });
        expect(actionsArg).toStrictEqual([]);
        expect(signalArg).toBeInstanceOf(AbortSignal);
        expect(engine.forceAct).not.toHaveBeenCalled();
        dispose();
    });

    test("forceAct rejects before invoking the active engine with no available actions", async () => {
        const { scheduler, engine, dispose } = createScheduler();

        const result = await scheduler.forceAct();

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(LogicError);
        }
        expect(engine.tryAct).not.toHaveBeenCalled();
        expect(engine.forceAct).not.toHaveBeenCalled();
        dispose();
    });
});
