import { test } from "$lib/testing";
import { describe, expect, vi } from "vitest";
import { toast } from "svelte-sonner";

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
        expect(harness.diagnosticKeys).toStrictEqual([INFO]);

        diag.dismiss(INFO);
        expect(harness.diagnosticKeys).toStrictEqual([info]);

        diag.trigger(INFO);
        expect(harness.diagnosticKeys).toStrictEqual([info, INFO]);

        diag.trigger(WARN);
        expect(harness.diagnosticKeys).toStrictEqual([info, INFO, WARN]);

        diag.suppress(WARN);
        expect(harness.diagnosticKeys).toStrictEqual([info, INFO, warn]);

        diag.trigger(INFO);
        expect(harness.diagnosticKeys).toStrictEqual([info, INFO, warn, INFO]);

        diag.trigger(ERR, undefined, false);
        expect(harness.diagnosticKeys).toStrictEqual([info, INFO, warn, INFO, ERR]);

        diag.suppress(INFO);
        expect(harness.diagnosticKeys).toStrictEqual([info, info, warn, info, ERR]);
    });

    test("toast", ({harness}) => {
        const diag = harness.server.diagnostics;
        const toastWarnSpy = vi.spyOn(toast, "warning");
        diag.trigger(WARN, undefined, true);
        expect(toastWarnSpy, "report=true").toHaveBeenCalledOnce();
        toastWarnSpy.mockClear();

        diag.trigger(WARN, undefined, false);
        expect(toastWarnSpy, "report=false").not.toHaveBeenCalled();
        toastWarnSpy.mockClear();

        diag.suppress(WARN);
        diag.trigger(WARN, undefined, true);
        expect(toastWarnSpy, "report but suppressed").not.toHaveBeenCalled();
    });

    test("dismiss by key", ({harness}) => {
        const diag = harness.server.diagnostics;
        diag.trigger(INFO);
        diag.trigger(INFO);
        diag.trigger(WARN);

        diag.dismiss(INFO);

        expect(harness.diagnosticKeys).toStrictEqual([info, info, WARN]);
    });

    test("dismissAll", ({harness}) => {
        const diag = harness.server.diagnostics;
        diag.trigger(INFO);
        diag.trigger(WARN, undefined, false);
        diag.trigger(ERR, undefined, false);

        expect(harness.diagnostics.some(d => d.dismissed)).toBe(false);
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

        expect(harness.diagnosticKeys).toStrictEqual([warn, err]);
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
