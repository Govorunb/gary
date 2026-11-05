// @vitest-environment svelte-client
import { expect, test, vi } from "vitest";
import { ok } from "neverthrow";
import { AutoPoker } from "./scheduler.svelte";
import { UserPrefs, zUserPrefs } from "./prefs.svelte";
import { EVENT_BUS } from "./events/bus";
import type { Session } from "./session.svelte";

test("reschedules active auto-act timers when preferences are edited or imported", async () => {
    const { scheduler, prefs, poker, dispose } = setup();
    try {
        expect(prefs.setAutoActIntervals({ tryInterval: 1000, forceInterval: 2000 }).isOk()).toBe(true);
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(2000);
        expect(scheduler.requestAct).toHaveBeenCalledTimes(2);
        expect(scheduler.queueForce).toHaveBeenCalledOnce();

        const imported = prefs.data;
        imported.app.autoAct = { tryInterval: 500, forceInterval: 1000 };
        expect(prefs.importData(imported).isOk()).toBe(true);
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(1000);
        expect(scheduler.requestAct).toHaveBeenCalledTimes(4);
        expect(scheduler.queueForce).toHaveBeenCalledTimes(2);

        poker.autoAct = false;
        await Promise.resolve();
        expect(vi.getTimerCount()).toBe(0);
    } finally {
        dispose();
    }
});

function setup() {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { setItem: vi.fn() });
    const scheduler = $state({
        canAct: true,
        actPending: false,
        hasPendingForce: false,
        requestAct: vi.fn(),
        queueForce: vi.fn(),
    });
    const disposers: Array<() => void> = [];
    let userPrefs: UserPrefs;
    let poker: AutoPoker;
    const cleanup = $effect.root(() => {
        userPrefs = new UserPrefs(ok(zUserPrefs.decode({})));
        userPrefs.setAutoActIntervals({ tryInterval: 30_000, forceInterval: 30_000 });
        poker = new AutoPoker({ userPrefs, scheduler, bus: EVENT_BUS, live: true, onDispose: (cb: () => void) => { disposers.push(cb); } } as unknown as Session);
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
        scheduler, act, prefs: userPrefs!, poker: poker!,
        dispose() {
            poker!.autoAct = false;
            disposers.forEach(dispose => dispose());
            cleanup();
            vi.unstubAllGlobals();
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
