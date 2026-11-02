import Ajv from "ajv";
import { Result } from "neverthrow";
import type { Action } from "#lib/api/v1/spec.js";
import { parseError, snapshotState } from "../utils";

// An unsupported schema is not evidence that the engine's data is invalid.
export const validateActionData = Result.fromThrowable(
    (schema: NonNullable<Action["schema"]>, data: unknown): boolean =>
        new Ajv({ validateFormats: false, strict: false }).compile(snapshotState(schema))(data) as boolean,
    parseError,
);
