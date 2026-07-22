import { describe, expect, test } from "vitest";
import { EVENT_BUS } from "../events/bus";
import { deleteField, moveField } from "./migrations";

describe("migration helpers", () => {
    test("moves fields across nested paths", () => {
        const data: Record<string, any> = {
            old: { value: 1 },
            config: { keep: true },
        };

        moveField(data, "old", "config.nested.value");

        expect(data).toStrictEqual({
            config: { keep: true, nested: { value: { value: 1 } } },
        });
    });

    test("refuses to overwrite data or create a forbidden parent", () => {
        expect(() => moveField({ old: 1, new: 2 }, "old", "new"))
            .toThrow();
        expect(() => moveField({ old: 1 }, "old", "nested.new", { createIntermediate: false }))
            .toThrow();
    });

    test("leaves data unchanged when the source path is absent", () => {
        const data = { keep: true };

        moveField(data, "missing.nested", "new");
        deleteField(data, "missing.nested");

        expect(data).toStrictEqual({ keep: true });
    });

    test("deletes nested fields without disturbing their siblings", () => {
        const data = { config: { remove: "value", keep: "this" } };

        deleteField(data, "config.remove");

        expect(data).toStrictEqual({ config: { keep: "this" } });
    });

    test("reports successful and skipped migrations", () => {
        const events: unknown[] = [];
        const sub = EVENT_BUS.subscribe([
            "app/migrations/field_move",
            "app/migrations/field_move_skipped",
            "app/migrations/field_delete_skipped",
        ] as const);
        sub.onnext((event) => events.push(event));

        try {
            moveField({ old: true }, "old", "new");
            moveField({}, "missing", "new");
            deleteField({}, "missing");
        } finally {
            sub.destroy();
        }

        expect(events).toMatchObject([
            {
                key: "app/migrations/field_move",
                data: { fromPath: "old", toPath: "new" },
            },
            {
                key: "app/migrations/field_move",
                data: { fromPath: "missing", toPath: "new" },
            },
            {
                key: "app/migrations/field_move_skipped",
                data: { fromPath: "missing", toPath: "new", reason: "source_not_found" },
            },
            {
                key: "app/migrations/field_delete_skipped",
                data: { path: "missing", reason: "path_not_found" },
            },
        ]);
    });
});
