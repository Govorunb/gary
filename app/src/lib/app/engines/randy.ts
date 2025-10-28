import { type Action } from "$lib/api/v1/spec";
import { pick as pickRandom } from "../utils.svelte";
import { Engine, zEngineAct, type EngineAct } from ".";
import {JSONSchemaFaker} from "json-schema-faker";
import type { Session } from "../session.svelte";

/** Randy - automatically generates actions conforming to the schema using [json-schema-faker](https://npmjs.org/package/json-schema-faker).
 * 
 * Options:
 * - **chanceDoNothing**: On try_act (when not forced, e.g. on non-silent context), this is the chance to do nothing instead of an action. Number between 0 and 1.
 */
export class Randy extends Engine<RandyOptions> {
    readonly name: string = "Randy";

    async tryAct(session: Session, actions: Action[]): Promise<EngineAct | null> {
        if (Math.random() < this.options.chanceDoNothing) {
            return null;
        }
        return this.forceAct(session, actions, "", "");
    }
    async forceAct(_session: Session, actions: Action[], _query: string, _state: string): Promise<EngineAct> {
        const action = pickRandom(actions);
        return zEngineAct.parse({
            name: action.name,
            data: JSON.stringify(this.generate(action)),
        });
    }

    private generate(action: Action): any {
        if (!action.schema) return "null";
        return JSONSchemaFaker.generate(action.schema);
    }
}

export type RandyOptions = {
    /** On try_act (when not forced, e.g. on non-silent context), this is the chance to do nothing instead of an action. Number between 0 and 1. */
    chanceDoNothing: number;
}