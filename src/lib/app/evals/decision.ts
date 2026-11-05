import z from "zod";
import { zForceAction } from "#lib/api/v1/spec.js";
import type { Engine } from "../engines/index.svelte";
import { engineSettingsSchema } from "../engines/create";
import { redactSensitiveData } from "../events/sensitive";
import { snapshotState } from "../utils";

const zProfile = z.strictObject({
    id: z.string().nonempty(), name: z.string(), settings: z.record(z.string(), z.unknown()),
});
export type EvalProfile = z.infer<typeof zProfile>;
/** Credentials and endpoints are blanked on the way in, so a profile never holds them. Runs take them from the matching local engine. */
export const zEvalProfile = zProfile.transform(redactProfile);

/** What the scheduler asked an engine. Context and actions come from the session's log up to this point. */
export const zDecision = z.strictObject({
    engine: zEvalProfile,
    force: z.boolean(),
    forceContext: zForceAction.shape.data.optional(),
    selection: z.array(z.strictObject({ gameId: z.string(), name: z.string() })),
    systemPrompt: z.string(),
});
export type Decision = z.infer<typeof zDecision>;

export function captureProfile(engine: Engine<unknown>): EvalProfile {
    return redactProfile({ id: engine.id, name: engine.name, settings: snapshotState(engine.options) as EvalProfile["settings"] });
}

function redactProfile(profile: EvalProfile): EvalProfile {
    return { ...profile, settings: redactSensitiveData(engineSettingsSchema(profile.id), profile.settings) as EvalProfile["settings"] };
}
