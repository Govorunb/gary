import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DisplayHistory } from "./display-history.svelte";
import { EventBus } from "../events/bus";
import { EventLogStore } from "../events/log.svelte";
import { ContextManager } from "../context.svelte";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

test("ingestion and actor callbacks stay immediate across microtasks without publishing the display", async () => {
    const bus = new EventBus();
    const log = new EventLogStore(bus);
    const context = new ContextManager(log);
    const seen: string[] = [];
    context.onActorViewAppend(event => seen.push(event.id));
    for (let i = 0; i < 2_000; i++) {
        bus.emit("ui/context/input", { text: String(i), silent: true });
        await Promise.resolve();
    }
    expect(context.actorView).toHaveLength(2_000);
    expect(seen).toEqual(context.actorView.map(event => event.id));
    expect(context.userView).toEqual([]);
    expect(log.displayed).toEqual([]);
    expect(vi.getTimerCount()).toBe(2);
    vi.advanceTimersByTime(16);
    await Promise.all([context.whenDisplayed(), log.whenDisplayed()]);
    expect(context.userView).toHaveLength(1_000);
    expect(context.userView[0].data).toMatchObject({ text: "1000" });
    expect(context.userView.at(-1)?.data).toMatchObject({ text: "1999" });
    expect(log.displayed.map(event => event.id)).toEqual(context.userView.map(event => event.id));
    const snapshot = context.userView;
    bus.emit("ui/context/input", { text: "2000", silent: true });
    expect(context.userView).toBe(snapshot);
    vi.advanceTimersByTime(16);
    expect(context.userView[0]).toBe(snapshot[1]);
    expect(snapshot[0].data).toMatchObject({ text: "1000" });
    context.dispose();
    log.dispose();
});

test("reset drops unpublished messages without delaying actor reset or reviving old display rows", async () => {
    const bus = new EventBus();
    const log = new EventLogStore(bus);
    const context = new ContextManager(log);
    bus.emit("ui/context/input", { text: "discard", silent: true });
    const pending = context.whenDisplayed();
    bus.emit("ui/context/reset");
    await pending;
    expect(context.actorView).toEqual([]);
    bus.emit("ui/context/input", { text: "retain", silent: true });
    vi.advanceTimersByTime(16);
    expect(context.userView.map(event => event.data)).toEqual([{ text: "retain", silent: true }]);
    expect(log.displayed).toHaveLength(3);
    context.dispose();
    log.dispose();
});

test("clear and dispose cancel pending publication and release waiters", async () => {
    const history = new DisplayHistory<number>(3);
    for (let i = 0; i < 100; i++) history.append(i);
    const pending = history.whenPublished();
    history.clear();
    await pending;
    history.append(100);
    vi.advanceTimersByTime(16);
    expect(history.items).toEqual([100]);
    history.append(101);
    const last = history.whenPublished();
    history.dispose();
    await last;
    expect(vi.getTimerCount()).toBe(0);
    expect(history.items).toEqual([100]);
});
