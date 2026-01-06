import { describe, expect, test } from "vitest";
import { moveField, deleteField, migrate } from "./utils/migrations";
import r, { LogLevel } from "$lib/app/utils/reporting";

r.level = LogLevel.Warning;

const simple = {
	version: "1.0.1",
	migrate(data: any) {
		data.flag = true;
	}
};

const rename = {
	version: "1.0.1",
	migrate(data: any) {
		moveField(data, "old", "new");
	}
};

const add = {
	version: "1.1.0",
	migrate(data: any) {
		data.new = "value";
	}
};

const remove = {
	version: "1.2.0",
	migrate(data: any) {
		deleteField(data, "old");
	}
};

const moveDeeper = {
	version: "2.0.0",
	migrate(data: any) {
		if (!data.config) return;
		moveField(data, "config.value", "config.nested.value");
	}
};

const wrap = {
	version: "1.3.0",
	migrate(data: any) {
		moveField(data, "old", "new.old");
	}
};

describe("migrate", () => {
	test("returns null/undefined data as is", () => {
		r.level = LogLevel.Error;
		expect(migrate("1.0.1", null, [add, remove, moveDeeper, rename])).toBeNull();
		expect(migrate("1.0.1", undefined, [add, remove, moveDeeper, rename])).toBeUndefined();
		r.level = LogLevel.Warning;
	});

	test("returns data unchanged if version is invalid", () => {
		r.level = LogLevel.Error;
		const data = { version: "invalid", foo: "bar" };
		const result = migrate("1.0.1", data, [simple]);
		expect(result).toEqual(data);
		r.level = LogLevel.Warning;
	});

	test("returns data unchanged if version is missing", () => {
		r.level = LogLevel.Error;
		const data = { foo: "bar" };
		const result = migrate("1.0.1", data, [simple]);
		expect(result).toEqual(data);
		r.level = LogLevel.Warning;
	});

	test("applies simple migration", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const result = migrate("1.0.1", data, [simple]);
		expect(result).toStrictEqual({ version: "1.0.1", foo: "bar", flag: true });
	});

	test("applies rename migration", () => {
		const data = { version: "1.0.0", old: "value", foo: "bar" };
		const result = migrate("1.0.1", data, [rename]) as any;
		expect(result).toStrictEqual({ version: "1.0.1", foo: "bar", new: "value" });
	});

	test("applies rename migration: handles missing old field", () => {
		const data = { version: "1.0.0", foo: "bar" } as any;
		const result = migrate("1.0.1", data, [rename]) as any;
		expect(result).toStrictEqual({ version: "1.0.1", foo: "bar" });
	});

	test("applies rename migration: handles old field with nested object", () => {
		const data = { version: "1.0.0", old: { nested: "value", other: "field" } };
		const result = migrate("1.0.1", data, [rename]) as any;
		expect(result).toStrictEqual({ version: "1.0.1", new: { nested: "value", other: "field" } });
	});

	test("applies add field migration", () => {
		const data = { version: "1.0.0", existing: "value" };
		const result = migrate("1.1.0", data, [add]);
		expect(result).toStrictEqual({ version: "1.1.0", existing: "value", new: "value" });
	});

	test("applies remove field migration", () => {
		const data = { version: "1.1.0", old: "toRemove", keep: "this" };
		const result = migrate("1.2.0", data, [remove]);
		expect(result).toStrictEqual({ version: "1.2.0", keep: "this" });
	});

	test("applies nested migration", () => {
		const data = { version: "1.0.0", config: { value: 42, other: "stay" } };
		const result = migrate("2.0.0", data, [moveDeeper]);
		expect(result).toStrictEqual({
			version: "2.0.0",
			config: { nested: { value: 42 }, other: "stay"}
		});
	});

	test("does not apply migration if already at target version", () => {
		const data = { version: "1.0.1", foo: "bar" };
		const result = migrate("1.0.1", data, [simple]);
		expect(result).toEqual(data);
	});

	test("does not apply migration if current version is newer than target", () => {
		const data = { version: "2.0.0", foo: "bar" };
		const result = migrate("1.0.1", data, [simple]);
		expect(result).toEqual(data);
	});

	test("applies multiple migrations if needed", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const result = migrate("2.0.0", data, [simple, add, moveDeeper]);
		expect(result).toStrictEqual({ version: "2.0.0", foo: "bar", flag: true, new: "value" });
	});

	test("skips migrations when starting from intermediate version", () => {
		const data = { version: "1.0.5", foo: "bar" };
		const result = migrate("1.1.0", data, [simple, add]);
		expect(result).toStrictEqual({ version: "1.1.0", foo: "bar", new: "value" });
	});

	test("stops at last available migration if target version is beyond available migrations", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const result = migrate("100.0.0", data, [simple, add]);
		expect(result).toStrictEqual({ version: "100.0.0", foo: "bar", flag: true, new: "value" });
	});

	test("handles unsorted migration array", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const result = migrate("1.2.0", data, [simple, remove, add]);
		expect(result).toStrictEqual({ version: "1.2.0", foo: "bar", flag: true, new: "value" });
	});

	test("clones data before modifying", () => {
		const data = { version: "1.0.0", foo: "bar", old: {} };
		const result = migrate("1.0.1", data, [rename]);
		expect(result).not.toBe(data);
		expect((data as any).new).toBeUndefined();
		expect(result.new).toBeDefined();
	});

	test("handles semver with pre-release tags", () => {
		const data = { version: "1.0.0-alpha", foo: "bar" };
		const result = migrate("1.0.1", data, [simple]) as any;
		expect(result).toStrictEqual({ version: "1.0.1", foo: "bar", flag: true });
	});

	test("handles semver with patch versions", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const result = migrate("1.0.5", data, [simple]) as any;
		expect(result).toStrictEqual({ version: "1.0.5", foo: "bar", flag: true });
	});

	test("preserves nested objects and arrays", () => {
		const data = {
			version: "1.0.0",
			nested: { deep: { value: [1, 2, 3] } },
			arr: [{ a: 1 }, { b: 2 }]
		};
		const result = migrate("1.0.1", data, [simple]);
		expect(result).toStrictEqual({
			version: "1.0.1",
			flag: true,
			nested: { deep: { value: [1, 2, 3] } },
			arr: [{ a: 1 }, { b: 2 }]
		});
	});

	test("migration handles null data gracefully", () => {
		const migration = {
			version: "1.0.1",
			migrate(data: any) {
				if (!data) return;
				data.field = "value";
			}
		};
		const data = { version: "1.0.0", field: null as any };
		const result = migrate("1.0.1", data, [migration]);
		expect(result).toStrictEqual({ version: "1.0.1", field: "value" });
	});

	test("handles migration that only modifies specific paths", () => {
		const data = {
			version: "1.0.0",
			config: { enabled: true, nested: { value: 42 } },
			other: "unchanged"
		};
		const migration = {
			version: "1.0.1",
			migrate(data: any) {
				if (!data.config) return;
				data.config.newProp = "added";
			}
		};
		const result = migrate("1.0.1", data, [migration]);
		expect(result).toStrictEqual({
			version: "1.0.1",
			config: { enabled: true, nested: { value: 42 }, newProp: "added" },
			other: "unchanged"
		});
	});

	test("handles empty migrations array", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const result = migrate("1.0.1", data, []);
		expect(result).toEqual({ version: "1.0.1", foo: "bar" });
	});

	test("handles migration that returns undefined", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const migration = {
			version: "1.0.1",
			migrate(data: any) {
				delete data.foo;
			}
		};
		const result = migrate("1.0.1", data, [migration]);
		expect(result).toStrictEqual({ version: "1.0.1" });
	});

	test("handles migration chain with version gaps", () => {
		const data = { version: "1.0.0", value: 1 };
		const v1_1 = { version: "1.1.0", migrate(d: any) { d.value++; } };
		const v1_5 = { version: "1.5.0", migrate(d: any) { d.value *= 2; } };
		const v2_0 = { version: "2.0.0", migrate(d: any) { d.value += 10; } };
		const result = migrate("2.0.0", data, [v1_5, v2_0, v1_1]);
		expect(result).toStrictEqual({ version: "2.0.0", value: 14 });
	});

	test("applies wrap migration", () => {
		const data = { version: "1.0.0", old: { value: 42, nested: { deep: "test" } }, foo: "bar" };
		const result = migrate("1.3.0", data, [wrap]) as any;
		expect(result).toStrictEqual({
			version: "1.3.0",
			foo: "bar",
			new: { old: { value: 42, nested: { deep: "test" } } }
		});
	});

	test("wrap migration handles missing old field", () => {
		const data = { version: "1.0.0", foo: "bar" } as any;
		const result = migrate("1.3.0", data, [wrap]) as any;
		expect(result).toStrictEqual({ version: "1.3.0", foo: "bar" });
	});
});
