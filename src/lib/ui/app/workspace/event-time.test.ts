import { expect, test } from "vitest";
import { formatEventTime } from "./event-time";

const NOW = new Date("2026-06-18T12:00:00.000Z").getTime();

test("formatEventTime uses compact relative labels", () => {
    expect(formatEventTime(NOW, NOW)).toBe("now");
    expect(formatEventTime(NOW - 4_999, NOW)).toBe("now");
    expect(formatEventTime(NOW - 5_000, NOW)).toBe("5s");
    expect(formatEventTime(NOW - 59_999, NOW)).toBe("55s");
    expect(formatEventTime(NOW - 60_000, NOW)).toBe("1m");
    expect(formatEventTime(NOW - 59 * 60_000, NOW)).toBe("59m");
});

test("formatEventTime clamps timestamps that no longer fit the event rail", () => {
    expect(formatEventTime(NOW - 60 * 60_000, NOW)).toBe(">1h");
    expect(formatEventTime(NOW - 24 * 60 * 60_000, NOW)).toBe(">1h");
});
