import { describe, test, expect } from "vitest";
import { moveField, deleteField } from "./migrations";
import r, { LogLevel } from "$lib/app/utils/reporting";

r.level = LogLevel.Warning;

describe("migration helpers", () => {
    test("renameField renames top-level field", () => {
        const data: Record<string, any> = { old: "value", keep: "this" };
        moveField(data, "old", "new");
        expect(data).toStrictEqual({ new: "value", keep: "this" });
    });

    test("renameField renames nested field", () => {
        const data: Record<string, any> = { config: { old: "value", other: "stay" } };
        moveField(data, "config.old", "config.new");
        expect(data).toStrictEqual({ config: { new: "value", other: "stay" } });
    });

    test("renameField skips if source does not exist", () => {
        const data: Record<string, any> = { other: "value" };
        moveField(data, "missing", "new");
        expect(data).toStrictEqual({ other: "value" });
    });

    test("renameField skips if nested source parent does not exist", () => {
        const data: Record<string, any> = { other: "value" };
        moveField(data, "config.missing", "config.new");
        expect(data).toStrictEqual({ other: "value" });
    });

    test("renameField throws if destination already exists", () => {
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
});
