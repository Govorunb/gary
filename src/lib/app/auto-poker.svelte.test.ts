// @vitest-environment svelte-client
import { expect, test, vi } from "vitest";
import { AutoPoker } from "./scheduler.svelte";
import { EVENT_BUS } from "./events/bus";
import type { Session } from "./session.svelte";

function setup() {
    vi.useFakeTimers();
    const scheduler = $state({
        canAct: true,
        actPending: false,
        hasPendingForce: false,
        requestAct: vi.fn(),
        queueForce: vi.fn(),
    });
    const disposers: Array<() => void> = [];
    let poker: AutoPoker;
    const cleanup = $effect.root(() => {
        poker = new AutoPoker({ scheduler, onDispose: (cb: () => void) => { disposers.push(cb); } } as unknown as Session);
        poker.tryInterval = 60_000;
        poker.forceInterval = 30_000;
        poker.autoAct = true;
    });
    // a generation that takes `ms`, optionally sending an action
    async function act(ms: number, sends: boolean) {
        scheduler.canAct = false;
        await vi.advanceTimersByTimeAsync(ms);
        if (sends) EVENT_BUS.emit("api/actor/act", {} as never);
        scheduler.canAct = true;
        await Promise.resolve();
    }
    return {
        scheduler, act,
        dispose() {
            poker!.autoAct = false;
            disposers.forEach(dispose => dispose());
            cleanup();
            vi.useRealTimers();
        },
    };
}

test("force timer counts idle time, not time spent acting", async () => {
    const { scheduler, act, dispose } = setup();
    try {
        await vi.advanceTimersByTimeAsync(20_000);
        await act(20_000, false);
        await vi.advanceTimersByTimeAsync(9_999);
        expect(scheduler.queueForce).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(scheduler.queueForce).toHaveBeenCalledOnce();
    } finally {
        dispose();
    }
});

test("an engine that keeps waiting is still forced", async () => {
    const { scheduler, act, dispose } = setup();
    try {
        for (let i = 0; i < 6; i++) {
            await vi.advanceTimersByTimeAsync(4_000);
            await act(20_000, false);
        }
        expect(scheduler.queueForce).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(6_000);
        expect(scheduler.queueForce).toHaveBeenCalledOnce();
    } finally {
        dispose();
    }
});

test("a sent action restarts the force timer", async () => {
    const { scheduler, act, dispose } = setup();
    try {
        await vi.advanceTimersByTimeAsync(20_000);
        await act(5_000, true);
        await vi.advanceTimersByTimeAsync(29_999);
        expect(scheduler.queueForce).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(scheduler.queueForce).toHaveBeenCalledOnce();
    } finally {
        dispose();
    }
});
