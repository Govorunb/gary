import { expect, vi, describe } from "vitest";
import * as v1 from "$lib/api/v1/spec";
import { test } from "$lib/testing";
import { TIMEOUTS } from "$lib/api/diagnostics";

const ACTION = v1.zAction.decode({ name: "test_action", description: "test" });

describe("force lifecycle", () => {
    test("prioritizes forces and lets critical replace queued lower priorities", async ({harness}) => {
        await harness.client.hello();
        await harness.client.registerActions([ACTION]);

        const sendForce = async (priority: v1.ForcePriority, query: string) => {
            await harness.client.conn.send(v1.zForceAction.decode({
                game: harness.server.name,
                data: { query, action_names: [ACTION.name], priority },
            }));
        };

        await sendForce("low", "low");
        await sendForce("high", "high");
        await sendForce("medium", "medium");

        expect(harness.server.takeForce()?.data.query).toBe("high");
        harness.server.completeForce();
        expect(harness.server.takeForce()?.data.query).toBe("medium");
        harness.server.completeForce();
        expect(harness.server.takeForce()?.data.query).toBe("low");
        harness.server.completeForce();

        await sendForce("low", "replace me");
        await sendForce("critical", "critical");

        expect(harness.server.takeForce()?.data.query).toBe("critical");
        harness.server.completeForce();
        expect(harness.server.hasForce).toBe(false);
    });

    test("retries failed forced actions", async ({harness}) => {
        await harness.client.hello();
        await harness.client.registerActions([ACTION]);
        await harness.client.sendForce([ACTION.name], "Pick an action");

        harness.server.takeForce();
        await harness.server.sendAction(v1.zActData.decode({ id: "failed", name: ACTION.name }));
        harness.server.completeForce();
        await harness.client.sendActionResult("failed", false, "Try again");

        harness.server.takeForce();
        await harness.server.sendAction(v1.zActData.decode({ id: "succeeded", name: ACTION.name }));
        harness.server.completeForce();
        await harness.client.sendActionResult("succeeded", true);

        expect(harness.server.hasForce).toBe(false);
    });

    test("gives up on a force after the retry limit", async ({harness}) => {
        await harness.client.hello();
        await harness.client.registerActions([ACTION]);
        await harness.client.sendForce([ACTION.name], "Pick an action");

        for (let attempt = 0; harness.server.hasQueuedForce; attempt++) {
            expect(attempt, "force retried forever").toBeLessThan(10);
            harness.server.takeForce();
            const id = `attempt-${attempt}`;
            await harness.server.sendAction(v1.zActData.decode({ id, name: ACTION.name }));
            harness.server.completeForce();
            await harness.client.sendActionResult(id, false, "Nope");
        }

        expect(harness.server.hasForce).toBe(false);
    });

    test("a user send during generation does not claim the force", async ({harness}) => {
        await harness.client.hello();
        await harness.client.registerActions([ACTION]);
        await harness.client.sendForce([ACTION.name], "Pick an action");

        harness.server.takeForce();
        await harness.server.manualSend(ACTION.name);
        harness.server.completeForce();

        expect(harness.server.hasForce).toBe(false);
        expect(harness.session.eventLog.all.filter(e => e.key === "api/game/act/actor")).toHaveLength(0);
    });

    test("a forced action that times out is retried like a failure", async ({harness}) => {
        await harness.client.hello();
        await harness.client.registerActions([ACTION]);
        await harness.client.sendForce([ACTION.name], "Pick an action");

        harness.server.takeForce();
        await harness.server.sendAction(v1.zActData.decode({ id: "slow", name: ACTION.name }));
        harness.server.completeForce();
        vi.advanceTimersByTime(TIMEOUTS["perf/timeout/action_result"] + 100);
        expect(harness.server.hasQueuedForce).toBe(false);

        vi.advanceTimersByTime(20_000);
        expect(harness.server.hasQueuedForce).toBe(true);
    });

    test("a retrying force holds the queue against higher priorities, but critical replaces it", async ({harness}) => {
        await harness.client.hello();
        await harness.client.registerActions([ACTION]);
        const failOnce = async (query: string) => {
            expect(harness.server.takeForce()?.data.query).toBe(query);
            await harness.server.sendAction(v1.zActData.decode({ id: query, name: ACTION.name }));
            harness.server.completeForce();
            await harness.client.sendActionResult(query, false, "Try again");
        };

        await harness.client.sendForce([ACTION.name], "low force", undefined, undefined, "low");
        await failOnce("low force");
        await harness.client.sendForce([ACTION.name], "high force", undefined, undefined, "high");
        await failOnce("low force"); // still the low force's turn

        await harness.client.sendForce([ACTION.name], "critical force", undefined, undefined, "critical");
        expect(harness.server.takeForce()?.data.query).toBe("critical force");
        harness.server.completeForce();
        expect(harness.server.hasForce).toBe(false);
    });
});
