import { debounced, toStepPrecision } from ".";
import { expect, test, vi } from "vitest";

test("toStepPrecision", () => {
    expect(toStepPrecision(0.5, 0.01)).toBe("0.50");
    expect(toStepPrecision(1234, 10)).toBe("1234");
    expect(toStepPrecision(1234, 0.00001)).toBe("1234.00000");
    expect(toStepPrecision(1234.000001, 10)).toBe("1234.000001");
    expect(toStepPrecision(-567, 10)).toBe("-567");
    expect(toStepPrecision(-567, 0.01)).toBe("-567.00");
});

test("debounced reads a dynamic delay when scheduled", async () => {
    vi.useFakeTimers();
    try {
        let delay = 10;
        const callback = vi.fn();
        const run = debounced(callback, () => delay);

        run();
        delay = 20;
        run();
        await vi.advanceTimersByTimeAsync(10);
        expect(callback).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(10);
        expect(callback).toHaveBeenCalledOnce();
    } finally {
        vi.useRealTimers();
    }
});
