import r from "$lib/app/utils/reporting";
import { LogLevel } from "$lib/app/utils";
import { boundedToast } from "$lib/app/utils/bounded-toast";
import { test as baseTest, vi } from "vitest";
import { SelfTestHarness } from "./self-test-harness";

export const test = baseTest.extend<{harness: SelfTestHarness}>({
    // biome-ignore lint/correctness/noEmptyPattern: required by vitest
    harness: async ({}, use) => {
        r.level = LogLevel.Fatal;
        boundedToast.reset();
        vi.useFakeTimers();
        const harness = new SelfTestHarness();
        try {
            await harness.connect();
            await use(harness);
        } finally {
            await harness.dispose();
            vi.useRealTimers();
            boundedToast.reset();
        }
    }
});
