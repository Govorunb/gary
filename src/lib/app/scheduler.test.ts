import { describe, expect, test, vi } from "vitest";
import { errAsync, okAsync } from "neverthrow";
import { Scheduler, LogicError } from "./scheduler.svelte";
import { EngineError, type EngineActResult } from "./engines/index.svelte";
import type { Session } from "./session.svelte";
import type { Action } from "$lib/api/v1/spec";

function createScheduler(
    choice: EngineActResult = { say: "No games, still here.", notify: false },
    games: Array<{
        nextForcePriority: null;
        getActiveActions(): Action[];
        sendAction(...args: unknown[]): Promise<void>;
    }> = [],
) {
    const disposers: Array<() => void> = [];
    const engine = {
        id: "test-engine",
        name: "Test Engine",
        tryAct: vi.fn((_session: Session, _actions?: Action[], _signal?: AbortSignal) => okAsync(choice)),
        forceAct: vi.fn((_session: Session, _actions?: Action[], _signal?: AbortSignal) => errAsync(new EngineError("forceAct should not be called"))),
    };
    const session = {
        registry: { games },
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
    test("gives pending acts time for actions to register", async () => {
        vi.useFakeTimers();
        const games: Array<{
            nextForcePriority: null;
            getActiveActions(): Action[];
            sendAction(...args: unknown[]): Promise<void>;
        }> = [];
        const { scheduler, engine, dispose } = createScheduler({ name: "serve" }, games);

        scheduler.requestAct(true);
        await vi.advanceTimersByTimeAsync(50);
        expect(engine.tryAct).not.toHaveBeenCalled();

        games.push({
            nextForcePriority: null,
            getActiveActions: () => [{ name: "serve" }],
            sendAction: vi.fn().mockResolvedValue(undefined),
        });
        await vi.advanceTimersByTimeAsync(50);
        await Promise.resolve();

        expect(engine.tryAct).toHaveBeenCalledOnce();
        expect(engine.tryAct).toHaveBeenCalledWith(
            expect.anything(),
            [{ name: "serve" }],
            expect.any(AbortSignal),
        );
        dispose();
        vi.useRealTimers();
    });

    test("tryAct rejects before invoking the active engine with no available actions", async () => {
        const { scheduler, engine, dispose } = createScheduler();

        const result = await scheduler.tryAct();

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(LogicError);
        }
        expect(engine.tryAct).not.toHaveBeenCalled();
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
