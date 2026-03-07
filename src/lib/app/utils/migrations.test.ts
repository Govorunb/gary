import { describe, test, expect } from "vitest";
import { moveField, deleteField } from "./migrations";


describe("migration helpers", () => {
    test("moveField renames top-level field", () => {
        const data: Record<string, any> = { old: "value", keep: "this" };
        moveField(data, "old", "new");
        expect(data).toStrictEqual({ new: "value", keep: "this" });
    });

    test("moveField renames nested field", () => {
        const data: Record<string, any> = { config: { old: "value", other: "stay" } };
        moveField(data, "config.old", "config.new");
        expect(data).toStrictEqual({ config: { new: "value", other: "stay" } });
    });

    test("moveField skips if source does not exist", () => {
        const data: Record<string, any> = { other: "value" };
        moveField(data, "missing", "new");
        expect(data).toStrictEqual({ other: "value" });
    });

    test("moveField skips if nested source parent does not exist", () => {
        const data: Record<string, any> = { other: "value" };
        moveField(data, "config.missing", "config.new");
        expect(data).toStrictEqual({ other: "value" });
    });

    test("moveField throws if destination already exists", () => {
        const data: Record<string, any> = { old: "value", new: "existing" };
        expect(() => moveField(data, "old", "new")).toThrow("destination already exists");
    });

    test("deleteField deletes top-level field", () => {
        const data: Record<string, any> = { remove: "value", keep: "this" };
        deleteField(data, "remove");
        expect(data.remove).toBeUndefined();
        expect(data.keep).toBe("this");
    });

    test("deleteField deletes nested field", () => {
        const data: Record<string, any> = { config: { remove: "value", keep: "this" } };
        deleteField(data, "config.remove");
        expect(data.config.remove).toBeUndefined();
        expect(data.config.keep).toBe("this");
    });

    test("deleteField skips if field does not exist", () => {
        const data: Record<string, any> = { keep: "this" };
        deleteField(data, "missing");
        expect(data.keep).toBe("this");
    });

    test("deleteField skips if nested parent does not exist", () => {
        const data: Record<string, any> = { keep: "this" };
        deleteField(data, "config.missing");
        expect(data.config).toBeUndefined();
        expect(data.keep).toBe("this");
    });

    test("moveField creates intermediate path by default", () => {
        const data: Record<string, any> = { old: "value" };
        moveField(data, "old", "nested.newField");
        expect(data).toStrictEqual({ nested: { newField: "value" } });
    });

    test("moveField creates intermediate path with createIntermediate: true", () => {
        const data: Record<string, any> = { old: "value" };
        moveField(data, "old", "nested.newField", { createIntermediate: true });
        expect(data).toStrictEqual({ nested: { newField: "value" } });
    });

    test("moveField throws if parent path missing with createIntermediate: false", () => {
        const data: Record<string, any> = { old: "value" };
        expect(() => moveField(data, "old", "nested.newField", { createIntermediate: false }))
            .toThrow("parent path does not exist");
    });

    test("moveField works with createIntermediate: false when parent exists", () => {
        const data: Record<string, any> = { old: "value", nested: { other: "exists" } };
        moveField(data, "old", "nested.newField", { createIntermediate: false });
        expect(data).toStrictEqual({ nested: { other: "exists", newField: "value" } });
    });

    test("moveField creates nested intermediate paths", () => {
        const data: Record<string, any> = { old: "value" };
        moveField(data, "old", "a.b.c.newField", { createIntermediate: true });
        expect(data).toStrictEqual({ a: { b: { c: { newField: "value" } } } });
    });
});
