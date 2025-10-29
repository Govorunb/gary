import { type Action } from "$lib/api/v1/spec";
import { pickRandom } from "../utils.svelte";
import { Engine, zEngineAct, type EngineAct } from ".";
import { JSONSchemaFaker } from "json-schema-faker";
import type { Session } from "../session.svelte";
import z from "zod";
import type { UserPrefs } from "../prefs.svelte";

/** Randy - automatically generates actions conforming to the schema using [json-schema-faker](https://npmjs.org/package/json-schema-faker).
 */
export class Randy extends Engine<RandyOptions> {
    readonly name: string = "Randy";

    constructor(userPrefs: UserPrefs) {
        super(userPrefs, "randy");
    }

    async tryAct(session: Session, actions?: Action[]): Promise<EngineAct | null> {
        const resolvedActions = this.resolveActions(session, actions);
        if (!resolvedActions.length) {
            return null;
        }
        if (Math.random() < this.options.chanceDoNothing) {
            return null;
        }
        return this.forceAct(session, resolvedActions);
    }

    async forceAct(session: Session, actions?: Action[]): Promise<EngineAct> {
        const resolvedActions = this.resolveActions(session, actions);
        if (!resolvedActions.length) {
            throw new Error("forceAct called with no available actions");
        }
        const action = pickRandom(resolvedActions);
        return zEngineAct.decode({
            name: action.name,
            data: JSON.stringify(this.generate(action)),
        });
    }

    private generate(action: Action): any {
        if (!action.schema) return "null";
        return JSONSchemaFaker.generate(action.schema);
    }
}

export const zRandyOptions = z.strictObject({
    /** On try_act (when not forced, e.g. on non-silent context), this is the chance to do nothing instead of an action. Number between 0 and 1. */
    chanceDoNothing: z.number().min(0).max(1),
});

export type RandyOptions = z.infer<typeof zRandyOptions>;
