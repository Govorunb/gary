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
        
        expect(harness.diagnostics).toHaveLength(1);
        expect(harness.diagnostics[0].id).toBe("perf/late/startup");
    });
    
    test("prot/startup/missing", async ({harness}) => {
        await harness.client.registerActions([]);
        
        expect(harness.diagnostics).toHaveLength(1);
        expect(harness.diagnostics[0].id).toBe("prot/startup/missing");
    });
    
    test("prot/startup/multiple", async ({harness}) => {
        await harness.client.hello();
        await harness.client.hello();
        
        expect(harness.diagnostics).toHaveLength(1);
        expect(harness.diagnostics[0].id).toBe("prot/startup/multiple");
    });
});
