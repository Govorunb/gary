import { expect, test as baseTest, vi, describe } from "vitest";
import { SelfTestHarness } from "../testing/self-test-harness";
import r, { LogLevel } from "$lib/app/utils/reporting";

const test = baseTest.extend<{harness: SelfTestHarness}>({
    // biome-ignore lint/correctness/noEmptyPattern: required by vitest
    harness: async ({}, use) => {
        r.level = LogLevel.Error;
        vi.useFakeTimers();
        const harness = new SelfTestHarness();
        await harness.connect();
        await use(harness);
        await harness.disconnect();
        vi.useRealTimers();
    }
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
