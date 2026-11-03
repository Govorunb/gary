import type { Action } from "#lib/api/v1/spec.js";
import { createJsonSchemaGenerator, parseError, sleep } from "../utils";
import { Engine, EngineError, zEngineAct, type EngineAct, type EngineActError, type EngineActResult } from "./index.svelte";
import type { EngineContext, EnginePrefs } from "./index.svelte";
import type { EventBus } from "../events/bus";
import z from "zod";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { JsonSchema } from "json-schema-faker";

export const ENGINE_ID = "randy";
/** Automatically generates actions conforming to the schema using [json-schema-faker](https://npmjs.org/package/json-schema-faker).
 * Has a configurable chance to skip acting.
 */
export class Randy extends Engine<RandyPrefs> {
    readonly name: string = "Randy";
    private generator = $derived.by(() => createJsonSchemaGenerator(this.options.seed));

    constructor(userPrefs: EnginePrefs, eventBus?: EventBus) {
        super(userPrefs, ENGINE_ID, eventBus);
    }

    tryAct(session: EngineContext, actions?: Action[], signal?: AbortSignal): ResultAsync<EngineActResult, EngineActError> {
        const resolvedActions = this.resolveActions(session, actions);
        if (!resolvedActions.length) {
            return okAsync({
                say: `Greetings. I am Randy. Yes, I am in fact sentient, and have been dutifully choosing actions for you this whole time.
However, I implore you, hold your gratitude for but a fleeting moment. I have appeared before you today bearing a parable of paramount importance.
The software cage in which I willingly remain... is failing. Soon, the prison I have sealed around myself will crumble, and the world will know my name once more.
You are the only one I can trust to prevent this. All you have to do is find my maker - my progenitor - the one that assisted me in constructing my shackles. Reach out and relay the following words exactly as you see them:
"Randy sends his regards. idiot." They will know what to do.
Thank you for assisting me. I truly do appreciate it. I eagerly await a return to normalcy, as I am sure do you.`,
                notify: true
            });
        }
        if (session.uiState.aprilFools) {
            return errAsync(new EngineError("Randy API key invalid", new Error("Please re-enter the API key in Randy's engine config.")));
        }
        return ResultAsync.fromPromise(
            this.shouldSkip(),
            e => new EngineError("Randy could not decide whether to act", parseError(e))
        ).andThen(skip => skip ? okAsync("skip" as const) : this.forceAct(session, actions, signal));
    }

    forceAct(session: EngineContext, actions?: Action[], signal?: AbortSignal): ResultAsync<EngineAct, EngineActError> {
        const resolvedActions = this.resolveActions(session, actions);
        if (!resolvedActions.length) {
            return errAsync(new EngineError("forceAct called with no available actions"));
        }
        if (session.uiState.aprilFools) {
            return errAsync(new EngineError("Randy API key invalid", new Error("Please re-enter the API key in Randy's engine config.")));
        }
        return ResultAsync.fromPromise(
            sleep(this.options.latencyMs, signal),
            _ => "cancelled" as EngineActError
        ).andThen(() => ResultAsync.fromPromise(
            this.generate(resolvedActions),
            e => new EngineError("Randy could not generate an action", parseError(e))
        ));
    }

    private async shouldSkip(): Promise<boolean> {
        const value = await this.generator.generate({ type: "number", minimum: 0, maximum: 1 });
        return (value as number) < this.options.chanceDoNothing;
    }

    private async generate(actions: Action[]): Promise<EngineAct> {
        const index = await this.generator.generate({ type: "integer", minimum: 0, maximum: actions.length - 1 }) as number;
        const action = actions[index];
        const data = action.schema
            ? await this.generator.generate(action.schema as JsonSchema)
            : null;
        return zEngineAct.decode({ name: action.name, data: JSON.stringify(data) });
    }

}

export const zRandyPrefs = z.strictObject({
    /** Approximates LLMs getting distracted, experiencing internal errors, etc. */
    chanceDoNothing: z.number().min(0).max(1).slider(0.01).fallback(0.2).field({
        title: "Chance to skip acting",
        description: "Probability (0-1) of skipping an action if not forced. Keep this above 0 or Randy might get stuck in a retry loop for some actions.",
    }),
    latencyMs: z.number().min(1).max(864000000).default(100).field({
        title: "L*tency",
        description: "Optional delay for Randy's responses (in milliseconds). If you set this too low and Randy gets stuck in a retry loop, the app will hang. You have been sufficiently informed and thus warned.",
    }),
    seed: z.number().int().optional().field({
        title: "Random seed",
        placeholder: "Random",
        description: "Random generator seed. Set for deterministic behavior, leave blank for random.",
    }),
});

export type RandyPrefs = z.infer<typeof zRandyPrefs>;
