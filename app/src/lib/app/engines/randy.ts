import { type Action, Act } from "$lib/api/v1/spec";
import { pick } from "../utils";
import { Engine } from "./engine";
import {JSONSchemaFaker} from "json-schema-faker";

/** Randy - automatically generates actions conforming to the schema using [json-schema-faker](https://npmjs.org/package/json-schema-faker).
 * 
 */
export class Randy extends Engine {
    readonly name: string = "Randy";
    public chanceDoNothing: number = 0.5;
    async try_act(actions: Action[]): Promise<Act | null> {
        if (Math.random() < this.chanceDoNothing) {
            return null;
        }
        return this.force_act(actions, "", "");
    }
    async force_act(actions: Action[], query: string, state: string): Promise<Act> {
        const action = pick(actions);
        return new Act({
            name: action.name,
            data: JSON.stringify(this.generate(action)),
        });
    }
    async context(message: string, silent: boolean): Promise<void> {
        return;
    }

    private generate(action: Action): Promise<any> {
        return JSONSchemaFaker.generate(action.schema);
    }
    
}