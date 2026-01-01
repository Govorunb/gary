import { expect, vi, describe } from "vitest";
import * as v1 from "$lib/api/v1/spec";
import { test } from "$lib/testing";
import { TIMEOUTS } from "$lib/api/diagnostics";

describe("startup", () => {
    test("perf/late/startup", async ({harness}) => {
        vi.advanceTimersByTime(TIMEOUTS["perf/late/startup"] + 100);
        await harness.client.hello();

        expect(harness.diagnosticIds).toStrictEqual(["perf/late/startup"]);
    });

    test("prot/startup/missing", async ({harness}) => {
        await harness.client.registerActions([]);

        expect(harness.diagnosticIds).toStrictEqual(["prot/startup/missing"]);
    });

    test("prot/startup/multiple", async ({harness}) => {
        await harness.client.hello();
        await harness.client.hello();

        expect(harness.diagnosticIds).toStrictEqual(["prot/startup/multiple"]);
    });
});

describe("prot/invalid_message", () => {
    test("not JSON", async ({harness}) => {
        await harness.client.conn.sendRaw("not valid JSON");

        expect(harness.diagnosticIds).toStrictEqual(["prot/invalid_message"]);
    });

    test("invalid command", async ({harness}) => {
        await harness.client.conn.sendRaw(JSON.stringify({
            command: "invalid",
            game: harness.server.name,
            data: {}
        }));

        expect(harness.diagnosticIds).toStrictEqual(["prot/invalid_message"]);
    });

    test("Neuro message from game", async ({harness}) => {
        await harness.client.conn.sendRaw(JSON.stringify({
            command: "action",
            data: { id: "a", action: "test", data: {} }
        }));

        expect(harness.diagnosticIds).toStrictEqual(["prot/invalid_message"]);
    });

    test("missing game", async ({harness}) => {
        await harness.client.conn.sendRaw(JSON.stringify({
            command: "actions/register",
            data: { actions: [] }
        }));

        expect(harness.diagnosticIds).toStrictEqual(["prot/invalid_message"]);
    });
});

describe("actions/register", () => {
    test("prot/v1/register/conflict", async ({harness}) => {
        await harness.client.hello();
        const action = v1.zAction.decode({ name: "test_action", schema: null });
        await harness.client.registerActions([action]);
        await harness.client.registerActions([action]);
    
        expect(harness.diagnosticIds).toStrictEqual(["prot/v1/register/conflict"]);
    });
});

describe("actions/unregister", () => {
    test("prot/unregister/unknown", async ({harness}) => {
        await harness.client.hello();
        await harness.client.unregisterActions(["nonexistent"]);
    
        expect(harness.diagnosticIds).toStrictEqual(["prot/unregister/unknown"]);
    });
    
    test("prot/unregister/inactive", async ({harness}) => {
        await harness.client.hello();
        const action = v1.zAction.decode({ name: "test_action", schema: null });
        await harness.client.registerActions([action]);
        await harness.client.unregisterActions([action.name]);
        await harness.client.unregisterActions([action.name]);
    
        expect(harness.diagnosticIds).toStrictEqual(["prot/unregister/inactive"]);
    });
});

describe("actions/force", () => {
    test("prot/force/empty", async ({harness}) => {
        await harness.client.hello();
        const force: v1.ForceAction = v1.zForceAction.decode({
            game: harness.server.name,
            data: { query: "test", action_names: [] },
        });
        await harness.client.conn.send(force);
    
        expect(harness.diagnosticIds).toStrictEqual(["prot/force/empty"]);
        expect(harness.diagnostics[0].context).toEqual({ msg: force });
    });
    
    test("prot/force/some_invalid", async ({harness}) => {
        await harness.client.hello();
    
        const action = v1.zAction.decode({ name: "test_action", schema: null });
        await harness.client.registerActions([action]);
    
        const force: v1.ForceAction = v1.zForceAction.decode({
            game: harness.server.name,
            data: { query: "test", action_names: [action.name, "unknown"] },
        });
        await harness.client.conn.send(force);
    
        expect(harness.diagnosticIds).toStrictEqual(["prot/force/some_invalid"]);
        expect(harness.diagnostics[0].context).toEqual({ msg: force, unknownActions: ["unknown"] });
    });
    
    test("prot/force/all_invalid", async ({harness}) => {
        await harness.client.hello();
        const force: v1.ForceAction = v1.zForceAction.decode({
            game: harness.server.name,
            data: { query: "test", action_names: ["unknown1", "unknown2"] },
        });
        await harness.client.conn.send(force);
    
        expect(harness.diagnosticIds).toStrictEqual(["prot/force/all_invalid"]);
        expect(harness.diagnostics[0].context).toEqual({ msg: force });
    });
    
    test("prot/force/multiple", async ({harness}) => {
        await harness.client.hello();
    
        const action = v1.zAction.decode({ name: "test_action", schema: null });
        await harness.client.registerActions([action]);
        const fq = harness.session.scheduler.forceQueue;
        expect(fq, "erm... monsieur. you appear to be sharing state between tests again").toStrictEqual([]);
        
        // manual/auto-act (should be completely ignored by the diagnostic)
        fq.push(null);
    
        const force: v1.ForceAction = v1.zForceAction.decode({
            game: harness.server.name,
            data: { query: "test", action_names: [action.name] },
        });
        expect(fq).toStrictEqual([null]);
        
        await harness.client.conn.send(force);
        expect(fq).toEqual([null, [{...action, active:true}]]);
        expect(harness.diagnosticIds, "first force with non-client in queue").toStrictEqual([]);

        await harness.client.conn.send(force);
        expect(harness.diagnosticIds).toStrictEqual(["prot/force/multiple"]);
    });
});

describe("action/result", () => {
    test("prot/result/error_nomessage", async ({harness}) => {
        await harness.client.hello();

        await harness.server.conn.send(v1.zAct.decode({ data: { id: "test-id", name: "e" } }));

        const result: v1.ActionResult = v1.zActionResult.decode({
            game: harness.server.name,
            data: { id: "test-id", success: false }
        });
        await harness.client.conn.send(result);

        expect(harness.diagnosticIds).toStrictEqual(["prot/result/error_nomessage"]);
    });
    test("perf/late/action_result", async ({harness}) => {
        await harness.client.hello();

        await harness.server.sendAction(v1.zActData.decode({id: "test-id", name: "e" }));

        vi.advanceTimersByTime(TIMEOUTS["perf/late/action_result"] + 100);

        const result: v1.ActionResult = v1.zActionResult.decode({
            game: harness.server.name,
            data: { id: "test-id", success: true }
        });
        await harness.client.conn.send(result);

        expect(harness.diagnosticIds).toStrictEqual(["perf/late/action_result"]);
    });
    test("perf/timeout/action_result", async ({harness}) => {
        await harness.client.hello();

        await harness.server.sendAction(v1.zActData.decode({id: "test-id", name: "e"}));

        vi.advanceTimersByTime(TIMEOUTS["perf/timeout/action_result"] + 100);

        expect(harness.diagnosticIds).toStrictEqual(["perf/timeout/action_result"]);
        expect(harness.diagnostics[0].context).toEqual({ actionId: "test-id" });
    });
});

test("prot/v1/game_renamed", async ({harness}) => {
    await harness.client.hello();

    const context: v1.Context = v1.zContext.decode({
        game: "renamed-game",
        data: { message: "test", silent: false }
    });
    await harness.client.conn.send(context);

    expect(harness.diagnosticIds).toStrictEqual(["prot/v1/game_renamed"]);
});
