import { toStepPrecision } from ".";
import { expect, test } from "vitest";

test("toStepPrecision", () => {
    expect(toStepPrecision(0.5, 0.01)).toBe("0.50");
    expect(toStepPrecision(1234, 10)).toBe("1234");
    expect(toStepPrecision(1234, 0.00001)).toBe("1234.00000");
    expect(toStepPrecision(1234.000001, 10)).toBe("1234.000001");
    expect(toStepPrecision(-567, 10)).toBe("-567");
    expect(toStepPrecision(-567, 0.01)).toBe("-567.00");
});
