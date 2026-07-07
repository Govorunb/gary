import { describe, expect, test } from "vitest";
import {
    BoundedToastLimiter,
    type BoundedToastDecision,
    type BoundedToastRenderDecision,
    type BoundedToastSkipDecision,
} from "./bounded-toast";

function expectRender(decision: BoundedToastDecision): asserts decision is BoundedToastRenderDecision {
    expect(decision.action).toBe("render");
    if (decision.action !== "render") throw new Error(`Expected render, got ${decision.action}`);
}

function expectSkip(decision: BoundedToastDecision): asserts decision is BoundedToastSkipDecision {
    expect(decision.action).toBe("skip");
    if (decision.action !== "skip") throw new Error(`Expected skip, got ${decision.action}`);
}

describe("BoundedToastLimiter", () => {
    test("coalesces repeated notifications and throttles visible updates", () => {
        const limiter = new BoundedToastLimiter({
            idPrefix: "test",
            minUpdateIntervalMs: 1_000,
        });

        const first = limiter.record({ title: "Action result not received", identity: "diag:timeout", now: 0 });
        expectRender(first);
        expect(first.title).toBe("Action result not received");
        expect(first.description).toBeUndefined();

        const repeat = limiter.record({ title: "Action result not received", identity: "diag:timeout", now: 100 });
        expectSkip(repeat);
        expect(repeat.reason).toBe("throttled");
        expect(repeat.id).toBe(first.id);
        expect(repeat.flushInMs).toBe(900);

        const flush = limiter.flush("diag:timeout", 1_000);
        expectRender(flush);
        expect(flush.id).toBe(first.id);
        expect(flush.title).toBe("Action result not received (2x)");
        expect(flush.description).toBe("Repeated 2 times.");
    });

    test("caps active toasts by evicting the oldest matching-priority toast", () => {
        const limiter = new BoundedToastLimiter({ maxActive: 2, idPrefix: "test" });

        const first = limiter.record({ title: "one", identity: "one", priority: 4, now: 0 });
        const second = limiter.record({ title: "two", identity: "two", priority: 4, now: 1 });
        const third = limiter.record({ title: "three", identity: "three", priority: 4, now: 2 });

        expectRender(first);
        expectRender(second);
        expectRender(third);
        expect(third.dismissIds).toStrictEqual([first.id]);
        expect(limiter.activeCount).toBe(2);
        expect(limiter.has("one")).toBe(false);
        expect(limiter.has("two")).toBe(true);
        expect(limiter.has("three")).toBe(true);
    });

    test("keeps higher-priority active toasts when a lower-priority toast would exceed the cap", () => {
        const limiter = new BoundedToastLimiter({ maxActive: 1, idPrefix: "test" });

        const error = limiter.record({ title: "fatal", identity: "fatal", priority: 6, now: 0 });
        const warning = limiter.record({ title: "warning", identity: "warning", priority: 4, now: 1 });

        expectRender(error);
        expectSkip(warning);
        expect(warning.reason).toBe("evicted");
        expect(warning.dismissIds).toStrictEqual([]);
        expect(limiter.has("fatal")).toBe(true);
        expect(limiter.has("warning")).toBe(false);
    });

    test("starts a fresh toast id after release", () => {
        const limiter = new BoundedToastLimiter({ idPrefix: "test" });

        const first = limiter.record({ title: "Duplicate action", identity: "diag:duplicate", now: 0 });
        expectRender(first);

        limiter.release(first.id);
        const next = limiter.record({ title: "Duplicate action", identity: "diag:duplicate", now: 100 });
        expectRender(next);

        expect(next.id).not.toBe(first.id);
        expect(next.title).toBe("Duplicate action");
    });
});
