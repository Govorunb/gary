import { expect, test as baseTest, vi, describe } from "vitest";
import { SelfTestHarness } from "../testing/self-test-harness";
import r, { LogLevel } from "$lib/app/utils/reporting";
import * as v1 from "$lib/api/v1/spec";

const test = baseTest.extend<{harness: SelfTestHarness}>({
    // biome-ignore lint/correctness/noEmptyPattern: required by vitest
    harness: async ({}, use) => {
        r.level = LogLevel.Fatal;
        vi.useFakeTimers();
        const harness = new SelfTestHarness();
        await harness.connect();
        await use(harness);
        await harness.disconnect();
        vi.useRealTimers();
    }
});

const INFO = "misc/test/info";
const WARN = "misc/test/warn";
const ERR = "misc/test/error";

const info = `!${INFO}`;
const warn = `!${WARN}`;
const err = `!${ERR}`;

describe("suppression", () => {
    test("isSuppressed", ({harness}) => {
        const diag = harness.server.diagnostics;
        expect(diag.isSuppressed(INFO)).toBe(false);
        for (let i = 0; i < 2; i++) {
            diag.suppress(INFO);
            expect(diag.isSuppressed(INFO)).toBe(true);
            expect(diag.suppressions).toStrictEqual([INFO]);
        }
    });

    test("suppression + dismissal", ({harness}) => {
        const diag = harness.server.diagnostics;
        diag.trigger(INFO);
        expect(harness.diagnosticIds).toStrictEqual([INFO]);

        diag.dismiss(INFO);
        expect(harness.diagnosticIds).toStrictEqual([info]);
        
        diag.trigger(INFO);
        expect(harness.diagnosticIds).toStrictEqual([info, INFO]);
        
        diag.trigger(WARN);
        expect(harness.diagnosticIds).toStrictEqual([info, INFO, WARN]);
        
        diag.suppress(WARN);
        expect(harness.diagnosticIds).toStrictEqual([info, INFO, warn]);
        
        diag.trigger(INFO);
        expect(harness.diagnosticIds).toStrictEqual([info, INFO, warn, INFO]);

        diag.trigger(ERR, undefined, false);
        expect(harness.diagnosticIds).toStrictEqual([info, INFO, warn, INFO, ERR]);
        
        diag.suppress(INFO);
        expect(harness.diagnosticIds).toStrictEqual([info, info, warn, info, ERR]);
    });

    test("report", ({harness}) => {
        const diag = harness.server.diagnostics;
        const reportSpy = vi.spyOn(r, "report");
        diag.trigger(INFO, undefined, true);
        expect(reportSpy, "report=true").toHaveBeenCalledOnce();
        reportSpy.mockClear();
        
        diag.trigger(INFO, undefined, false);
        expect(reportSpy, "report=false").not.toHaveBeenCalled();
        reportSpy.mockClear();
        
        diag.suppress(INFO);
        diag.trigger(INFO, undefined, true);
        expect(reportSpy, "report but suppressed").not.toHaveBeenCalled();
    });

    test("dismissDiagnosticsById", ({harness}) => {
        const diag = harness.server.diagnostics;
        diag.trigger(INFO);
        diag.trigger(INFO);
        diag.trigger(WARN);

        diag.dismiss(INFO);

        expect(harness.diagnosticIds).toStrictEqual([info, info, WARN]);
    });

    test("dismissAll", ({harness}) => {
        const diag = harness.server.diagnostics;
        diag.trigger(INFO);
        diag.trigger(WARN, undefined, false);
        diag.trigger(ERR, undefined, false);

        expect(harness.diagnostics.every(d => d.dismissed)).toBe(false);
        diag.dismissAll();
        expect(harness.diagnostics.every(d => d.dismissed)).toBe(true);
    });

    test("status + dismiss/suppress", ({harness}) => {
        const diag = harness.server.diagnostics;
        diag.trigger(WARN);
        expect(harness.status).toBe("warn");
        
        diag.dismiss(WARN);
        expect(harness.status, "dismiss didn't change status").toBe("ok");
        
        diag.trigger(ERR, undefined, false);
        expect(harness.status).toBe("error");
        diag.suppress(ERR);
        
        expect(harness.diagnosticIds).toStrictEqual([warn, err]);
        expect(harness.status, "suppress didn't dismiss").toBe("ok");
    });

    test("reset", ({harness}) => {
        const diag = harness.server.diagnostics;
        diag.trigger(INFO);
        diag.trigger(INFO);
        diag.suppress(INFO);
        
        expect(harness.diagnostics).toHaveLength(2);
        diag.reset();
        expect(harness.diagnostics, "reset did not reset").toHaveLength(0);
        
        expect(diag.isSuppressed(INFO), "reset should not affect suppressions").toBe(true);
    });
});

describe("startup", () => {
    test("perf/late/startup", async ({harness}) => {
        vi.advanceTimersByTime(600);
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

describe("protocol violations", () => {
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

    test("prot/v1/register/dupe", async ({harness}) => {
        await harness.client.hello();
        const action = v1.zAction.decode({ name: "test_action", description: "test", schema: null });
        await harness.client.registerActions([action]);
        await harness.client.registerActions([action]);

        expect(harness.diagnosticIds).toStrictEqual(["prot/v1/register/dupe"]);
    });

    test("prot/unregister/unknown", async ({harness}) => {
        await harness.client.hello();
        await harness.client.unregisterActions(["nonexistent"]);

        expect(harness.diagnosticIds).toStrictEqual(["prot/unregister/unknown"]);
    });

    test("prot/unregister/inactive", async ({harness}) => {
        await harness.client.hello();
        const action = v1.zAction.decode({ name: "test_action", description: "test", schema: null });
        await harness.client.registerActions([action]);
        await harness.client.unregisterActions(["test_action"]);
        await harness.client.unregisterActions(["test_action"]);

        expect(harness.diagnosticIds).toStrictEqual(["prot/unregister/inactive"]);
    });

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

        const action = v1.zAction.decode({ name: "test_action", description: "test", schema: null });
        await harness.client.registerActions([action]);

        const force: v1.ForceAction = v1.zForceAction.decode({
            game: harness.server.name,
            data: { query: "test", action_names: ["test_action", "unknown"] },
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

        const force: v1.ForceAction = v1.zForceAction.decode({
            game: harness.server.name,
            data: { query: "test", action_names: ["test_action"] },
        });
        await harness.client.conn.send(force);
        await harness.client.conn.send(force);

        expect(harness.diagnosticIds).toStrictEqual(["prot/force/multiple"]);
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

    test("prot/result/error_nomessage", async ({harness}) => {
        await harness.client.hello();

        const result: v1.ActionResult = v1.zActionResult.decode({
            game: harness.server.name,
            data: { id: "test-id", success: false, message: "" }
        });
        await harness.client.conn.send(result);

        expect(harness.diagnosticIds).toStrictEqual(["prot/result/error_nomessage"]);
    });
});
