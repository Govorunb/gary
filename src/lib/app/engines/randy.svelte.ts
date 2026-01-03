import type { Action } from "$lib/api/v1/spec";
import { pickRandom, sleep } from "../utils";
import { Engine, EngineError, zEngineAct, type EngineAct } from "./index.svelte";
import { JSONSchemaFaker } from "json-schema-faker";
import type { Session } from "../session.svelte";
import z from "zod";
import type { UserPrefs } from "../prefs.svelte";
import { errAsync, okAsync, ResultAsync } from "neverthrow";

export const ENGINE_ID = "randy";
/** Automatically generates actions conforming to the schema using [json-schema-faker](https://npmjs.org/package/json-schema-faker).
 * Has a configurable chance to skip acting.
 */
export class Randy extends Engine<RandyPrefs> {
    readonly name: string = "Randy";

    constructor(userPrefs: UserPrefs) {
        super(userPrefs, ENGINE_ID);
    }

    tryAct(session: Session, actions?: Action[]): ResultAsync<EngineAct | null, EngineError> {
        const resolvedActions = this.resolveActions(session, actions);
        if (!resolvedActions.length) {
            return okAsync(null);
        }
        if (Math.random() < this.options.chanceDoNothing) {
            session.context.actor({
                text: "Randy chose not to act",
                silent: true,
                visibilityOverrides: { engine: false }
            });
            return okAsync(null);
        }
        return this.forceAct(session, resolvedActions);
    }

    // TODO: use force prio to shorten l*tency (just so we can use it literally anywhere)
    forceAct(session: Session, actions?: Action[]): ResultAsync<EngineAct, EngineError> {
        const resolvedActions = this.resolveActions(session, actions);
        if (!resolvedActions.length) {
            return errAsync(new EngineError("forceAct called with no available actions"));
        }
        return ResultAsync.fromSafePromise(sleep(this.options.latencyMs))
            .map(() => {
                const action = pickRandom(resolvedActions);
                return zEngineAct.decode({
                    name: action.name,
                    data: JSON.stringify(this.generate(action)),
                });
            });
    }

    private generate(action: Action): any {
        if (!action.schema) return null;
        return JSONSchemaFaker.generate(action.schema);
    }
}

export const zRandyPrefs = z.strictObject({
    /** The chance to do nothing instead of acting.
     * Applicable when prompted to act but not forced (e.g. on non-silent context).
     * Can be used to approximate LLMs getting distracted, experiencing internal errors, etc.
     * 
     * Number between 0 and 1.
     * */
    chanceDoNothing: z.number().min(0).max(1).fallback(0.2),
    /** Randy will sleep for this long before responding (in milliseconds). Don't set too low or the app might freeze. */
    latencyMs: z.number().min(1).max(864000000).default(200),
});

export type RandyPrefs = z.infer<typeof zRandyPrefs>;
