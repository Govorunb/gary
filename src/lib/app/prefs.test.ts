import { afterEach, describe, expect, test, vi } from "vitest";
import { migrate } from "./utils/migrations";
import { UserPrefs, zUserPrefs } from "./prefs.svelte";
import { ok } from "neverthrow";

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

describe("auto-act preferences", () => {
    afterEach(() => vi.unstubAllGlobals());

    test("loads preferences saved before auto-act intervals existed", async () => {
        vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ version: "1.0.0-beta.1", app: { theme: "dark" } }) });
        expect((await UserPrefs.loadData()).isOk()).toBe(true);
    });

    test.each([
        { tryInterval: 0, forceInterval: 30000 },
        { tryInterval: -1, forceInterval: 30000 },
        { tryInterval: 1000, forceInterval: 0 },
        { tryInterval: 1000, forceInterval: -1 },
        { tryInterval: 5000, forceInterval: 4999 },
        { tryInterval: 0.5, forceInterval: 30000 },
        { tryInterval: 5000, forceInterval: 2_147_483_648 },
    ])("rejects invalid intervals through edits, imports, and loads: %j", async intervals => {
        const prefs = new UserPrefs(ok(zUserPrefs.decode({})));
        const before = prefs.data;
        const imported = { ...before, app: { ...before.app, autoAct: intervals } };
        vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(imported) });

        expect(prefs.setAutoActIntervals(intervals).isErr()).toBe(true);
        expect(prefs.importData(imported).isErr()).toBe(true);
        expect((await UserPrefs.loadData()).isErr()).toBe(true);
        expect(prefs.data).toEqual(before);
    });
});
