import { describe, expect, test } from "vitest";
import { migrate } from "./utils/migrations";

describe("migrate", () => {
    const migrations = [
        { version: "1.1.0", migrate(data: any) { data.order.push("first"); } },
        { version: "1.5.0", migrate(data: any) { data.order.push("second"); } },
        { version: "2.0.0", migrate(data: any) { data.order.push("third"); } },
    ];

    test("applies the required migration chain in version order", () => {
        const result = migrate("2.0.0", { version: "1.0.0", order: [] }, migrations.toReversed());

        expect(result).toStrictEqual({
            version: "2.0.0",
            order: ["first", "second", "third"],
        });
    });

    test("starts after the persisted version and stops at the target version", () => {
        const result = migrate("1.5.0", { version: "1.1.0", order: [] }, migrations);

        expect(result).toStrictEqual({ version: "1.5.0", order: ["second"] });
    });

    test("does not mutate persisted data", () => {
        const data = { version: "1.0.0", order: [] as string[] };

        const result = migrate("1.1.0", data, migrations);

        expect(result).not.toBe(data);
        expect(data).toStrictEqual({ version: "1.0.0", order: [] });
    });

    test("leaves absent or unversioned data alone", () => {
        expect(migrate("2.0.0", null, migrations)).toBeNull();
        expect(migrate("2.0.0", undefined, migrations)).toBeUndefined();
        expect(migrate("2.0.0", { order: [] }, migrations)).toStrictEqual({ order: [] });
        expect(migrate("2.0.0", { version: "invalid", order: [] }, migrations))
            .toStrictEqual({ version: "invalid", order: [] });
    });
});
