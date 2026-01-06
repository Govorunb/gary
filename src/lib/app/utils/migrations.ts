import r from "./reporting";
import { compare as semverCompare, valid as semverParse } from "semver";

export type Migration = {
    version: string;
    description?: string;
    migrate(data?: Record<string, any>): void;
}

export function migrate(toVersion: string, data: Record<string, any> | null | undefined, migrations: Migration[]): any {
    if (!data) return data;
    const result = structuredClone(data);
    
    let currVersion = semverParse(data?.version);
    if (!currVersion) {
		r.warn("Version not detected, cannot migrate");
		return data;
	}
	if (currVersion > toVersion) {
		r.warn(`Cannot migrate downwards (currently ${currVersion}, target ${toVersion}`);
		return data;
	}

    for (const migration of migrations.sort((a,b) => semverCompare(a.version, b.version))) {
        if (semverCompare(migration.version, currVersion) <= 0) {
            r.debug(`Skipping migration to ${migration.version} as ${currVersion} is same or newer`);
            continue;
        } else if (semverCompare(migration.version, toVersion) > 0) {
            r.debug(`Finished migrating, ${migration.version} > ${toVersion}`);
            break;
        }
        r.debug(`Migrating ${currVersion} to ${migration.version}`, migration.description);
        migration.migrate(result);
        currVersion = migration.version;
    }
    result.version = toVersion;
    return result;
}


export type FieldPath = string;
export type MoveOptions = {
	createIntermediate: boolean;
};

export function moveField(
	data: Record<string, any>,
	fromPath: FieldPath,
	toPath: FieldPath,
	opts?: MoveOptions
): void {
	const fromParts = fromPath.split(".");
	const toParts = toPath.split(".");
	const fromKey = fromParts.pop()!;
	const toKey = toParts.pop()!;
	r.verbose(`Moving .${fromPath} to .${toPath}`);

	const fromParent = navigate(data, fromParts);
	if (!fromParent || !(fromKey in fromParent)) {
		r.debug(`Rename field skipped: source path '${fromPath}' not found`);
		return;
	}

	const createIntermediate = opts?.createIntermediate ?? true;
	let toParent: Record<string, any>;
	if (createIntermediate) {
		toParent = ensurePath(data, toParts);
	} else {
		toParent = navigate(data, toParts)!;
		if (!toParent) {
			throw new Error(`Cannot rename to '${toPath}': parent path does not exist, and createIntermediate was specified as false.`);
		}
	}
	if (toKey in toParent) {
		throw new Error(`Cannot rename to '${toPath}': destination already exists`);
	}

	toParent[toKey] = fromParent[fromKey];
	delete fromParent[fromKey];
}

export function deleteField(data: Record<string, any>, path: FieldPath): void {
	const parts = path.split(".");
	const key = parts.pop()!;

	const parent = navigate(data, parts);
	if (!parent || !(key in parent)) {
		r.debug(`Delete field skipped: path '${path}' not found`);
		return;
	}

	delete parent[key];
}

function navigate(obj: any, pathParts: string[]): Record<string, any> | null {
	let current = obj;
	for (const part of pathParts) {
		if (typeof current !== "object" || current === null || !(part in current)) {
			return null;
		}
		current = current[part];
	}
	return current;
}

function ensurePath(obj: any, pathParts: string[]): Record<string, any> {
	let current = obj;
	for (const part of pathParts) {
		if (typeof current !== "object" || current === null) {
			current = {};
		}
		if (!(part in current)) {
			current[part] = {};
		}
		current = current[part];
	}
	return current;
}
