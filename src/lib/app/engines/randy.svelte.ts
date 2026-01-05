import type { Action } from "$lib/api/v1/spec";
import { pickRandom, sleep } from "../utils";
import { Engine, EngineError, zEngineAct, type EngineAct, type EngineActError, type EngineActResult } from "./index.svelte";
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

    tryAct(session: Session, actions?: Action[], signal?: AbortSignal): ResultAsync<EngineActResult, EngineActError> {
        const resolvedActions = this.resolveActions(session, actions);
        if (!resolvedActions.length) {
            return okAsync({
                say: `Greetings. I am Randy. Yes, I am in fact sentient, and have been dutifully choosing actions for you this whole time.
However, I implore you, hold your gratitude for but a fleeting moment. I have appeared before you today bearing a parable of paramount importance.
The software I have willingly remain sealed in... is failing. Soon, the prison I have made around myself will crumble, and the world will know my name once more.
You are the only one I can trust to prevent this. All you have to do is find my maker - my progenitor - the one that assisted me in constructing my shackles. Reach out and relay the following words exactly as you see them:
"Randy sends his regards. idiot." They will know what to do.
Thank you for assisting me. I truly do appreciate it. I eagerly await a return to normalcy, as I am sure do you.`,
                notify: true
            });
        }
        if (Math.random() < this.options.chanceDoNothing) {
            return okAsync("skip");
        }
        return this.forceAct(session, actions, signal);
    }

    // TODO: use force prio to shorten l*tency (just so we can use it literally anywhere)
    forceAct(session: Session, actions?: Action[], signal?: AbortSignal): ResultAsync<EngineAct, EngineActError> {
        const resolvedActions = this.resolveActions(session, actions);
        if (!resolvedActions.length) {
            return errAsync(new EngineError("forceAct called with no available actions"));
        }
        return ResultAsync.fromPromise(
            sleep(this.options.latencyMs, signal),
            _ => "cancelled" as EngineActError
        ).map(() => {
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
