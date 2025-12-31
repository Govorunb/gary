import { describe, expect, test } from "vitest";
import { migrate } from "./prefs.svelte";

const simpleMigration = {
	version: "1.0.1",
	migrate(data: any) {
		data.migrated = true;
	}
};

const renameMigration = {
	version: "1.0.1",
	migrate(data: any) {
		data.api = data.server;
		delete data.server;
		
		if (!data.api) return;
		data.api.serverPort = data.api.port;
		delete data.api.port;
	}
};

const addFieldMigration = {
	version: "1.1.0",
	migrate(data: any) {
		data.newField = "defaultValue";
	}
};

const removeFieldMigration = {
	version: "1.2.0",
	migrate(data: any) {
		delete data.oldField;
	}
};

const nestedMigration = {
	version: "2.0.0",
	migrate(data: any) {
		if (!data.config) return;
		data.config.nested = { value: data.config.value };
		delete data.config.value;
	}
};

describe("migrate", () => {
	test("returns null/undefined data as is", () => {
		expect(migrate("1.0.1", null)).toBeNull();
		expect(migrate("1.0.1", undefined)).toBeUndefined();
	});

	test("returns data unchanged if version is invalid", () => {
		const data = { version: "invalid", foo: "bar" };
		const result = migrate("1.0.1", data, [simpleMigration]);
		expect(result).toEqual(data);
	});

	test("returns data unchanged if version is missing", () => {
		const data = { foo: "bar" };
		const result = migrate("1.0.1", data, [simpleMigration]);
		expect(result).toEqual(data);
	});

	test("applies simple migration", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const result = migrate("1.0.1", data, [simpleMigration]);
		expect(result.version).toBe("1.0.1");
		expect(result.migrated).toBe(true);
		expect(result.foo).toBe("bar");
	});

	test("applies rename migration: renames server to api", () => {
		const data = { version: "1.0.0", server: { port: 8000 }, foo: "bar" };
		const result = migrate("1.0.1", data, [renameMigration]) as any;
		expect(result.version).toBe("1.0.1");
		expect(result.api).toStrictEqual({ serverPort: 8000 });
		expect(result.server).toBeUndefined();
		expect(result.foo).toBe("bar");
	});

	test("applies rename migration: handles missing server field", () => {
		const data = { version: "1.0.0", foo: "bar" } as any;
		const result = migrate("1.0.1", data, [renameMigration]) as any;
		expect(result.version).toBe("1.0.1");
		expect(result.api).toBeUndefined();
		expect(result.foo).toBe("bar");
	});

	test("applies rename migration: handles server with port field", () => {
		const data = { version: "1.0.0", server: { port: 9000, other: "value" } };
		const result = migrate("1.0.1", data, [renameMigration]) as any;
		expect(result.version).toBe("1.0.1");
		expect(result.api).toStrictEqual({ other: "value", serverPort: 9000 });
		expect(result.api.serverPort).toBe(9000);
	});

	test("applies add field migration", () => {
		const data = { version: "1.0.0", existing: "value" };
		const result = migrate("1.1.0", data, [addFieldMigration]);
		expect(result.version).toBe("1.1.0");
		expect(result.newField).toBe("defaultValue");
		expect(result.existing).toBe("value");
	});

	test("applies remove field migration", () => {
		const data = { version: "1.1.0", oldField: "toRemove", keep: "this" };
		const result = migrate("1.2.0", data, [removeFieldMigration]);
		expect(result.version).toBe("1.2.0");
		expect(result.oldField).toBeUndefined();
		expect(result.keep).toBe("this");
	});

	test("applies nested migration", () => {
		const data = { version: "1.0.0", config: { value: 42, other: "stay" } };
		const result = migrate("2.0.0", data, [nestedMigration]);
		expect(result.version).toBe("2.0.0");
		expect(result.config.nested).toEqual({ value: 42 });
		expect(result.config.value).toBeUndefined();
		expect(result.config.other).toBe("stay");
	});

	test("does not apply migration if already at target version", () => {
		const data = { version: "1.0.1", foo: "bar" };
		const result = migrate("1.0.1", data, [simpleMigration]);
		expect(result).toEqual(data);
	});

	test("does not apply migration if current version is newer than target", () => {
		const data = { version: "2.0.0", foo: "bar" };
		const result = migrate("1.0.1", data, [simpleMigration]);
		expect(result).toEqual(data);
	});

	test("applies multiple migrations if needed", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const result = migrate("2.0.0", data, [simpleMigration, addFieldMigration, nestedMigration]);
		expect(result.version).toBe("2.0.0");
		expect(result.migrated).toBe(true);
		expect(result.newField).toBe("defaultValue");
		expect(result.foo).toBe("bar");
	});

	test("skips migrations when starting from intermediate version", () => {
		const data = { version: "1.0.5", foo: "bar" };
		const result = migrate("1.1.0", data, [simpleMigration, addFieldMigration]);
		expect(result.version).toBe("1.1.0");
		expect(result.migrated).toBeUndefined();
		expect(result.newField).toBe("defaultValue");
	});

	test("stops at last available migration if target version is beyond available migrations", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const result = migrate("100.0.0", data, [simpleMigration, addFieldMigration]);
		expect(result.version).toBe("1.1.0");
		expect(result.migrated).toBe(true);
		expect(result.newField).toBe("defaultValue");
	});

	test("handles unsorted migration array", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const result = migrate("1.2.0", data, [simpleMigration, removeFieldMigration, addFieldMigration]);
		expect(result.version).toBe("1.2.0");
		expect(result.migrated).toBe(true);
		expect(result.newField).toBe("defaultValue");
	});

	test("clones data before modifying", () => {
		const data = { version: "1.0.0", foo: "bar", server: {} };
		const result = migrate("1.0.1", data, [renameMigration]);
		expect(result).not.toBe(data);
		expect((data as any).api).toBeUndefined();
		expect(result.api).toBeDefined();
	});

	test("handles semver with pre-release tags", () => {
		const data = { version: "1.0.0-alpha", foo: "bar" };
		const result = migrate("1.0.1", data, [simpleMigration]) as any;
		expect(result.version).toBe("1.0.1");
		expect(result.foo).toBe("bar");
	});

	test("handles semver with patch versions", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const result = migrate("1.0.5", data, [simpleMigration]) as any;
		expect(result.version).toBe("1.0.1");
		expect(result.foo).toBe("bar");
	});

	test("preserves nested objects and arrays", () => {
		const data = {
			version: "1.0.0",
			nested: { deep: { value: [1, 2, 3] } },
			arr: [{ a: 1 }, { b: 2 }]
		};
		const result = migrate("1.0.1", data, [simpleMigration]);
		expect(result.nested.deep.value).toEqual([1, 2, 3]);
		expect(result.arr).toEqual([{ a: 1 }, { b: 2 }]);
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
		expect(result.version).toBe("1.0.1");
		expect(result.field).toBe("value");
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
		expect(result.config.newProp).toBe("added");
		expect(result.config.enabled).toBe(true);
		expect(result.config.nested.value).toBe(42);
		expect(result.other).toBe("unchanged");
	});

	test("handles empty migrations array", () => {
		const data = { version: "1.0.0", foo: "bar" };
		const result = migrate("1.0.1", data, []);
		expect(result).toEqual(data);
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
		expect(result.version).toBe("1.0.1");
		expect(result.foo).toBeUndefined();
	});

	test("handles migration chain with version gaps", () => {
		const data = { version: "1.0.0", value: 1 };
		const v1_1 = { version: "1.1.0", migrate(d: any) { d.value++; } };
		const v1_5 = { version: "1.5.0", migrate(d: any) { d.value *= 2; } };
		const v2_0 = { version: "2.0.0", migrate(d: any) { d.value += 10; } };
		const result = migrate("2.0.0", data, [v1_5, v2_0, v1_1]);
		expect(result.version).toBe("2.0.0");
		expect(result.value).toBe(14);
	});
});
