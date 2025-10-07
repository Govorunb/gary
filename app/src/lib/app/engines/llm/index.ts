import type { Action } from "$lib/api/v1/spec";
import * as log from "@tauri-apps/plugin-log";
import { Engine, zEngineAct, type EngineAct } from "..";
import type { ContextManager } from "$lib/app/context.svelte";

export interface CommonLLMOptions {
    /** Let the model choose to do nothing (skip acting) if not forced. Approximates the model getting distracted calling other unrelated tools. */
    allowDoNothing?: boolean;
    /** Let the model trauma dump about its horrid life circumstances instead of doing something useful to society. Approximates realistic human behavior. */
    allowYapping?: boolean;
}

export abstract class LLMEngine<TOptions extends CommonLLMOptions> extends Engine<TOptions> {
    abstract name: string;

    constructor(options: TOptions, contextManager?: ContextManager) {
        contextManager ? super(options, contextManager) : super(options);
        this.contextManager.system(this.systemPrompt(), { silent: true });
    }
    
    try_act(actions: Action[]): Promise<EngineAct | null> {
        throw new Error("Method not implemented.");
    }
    async force_act(actions: Action[], query: string, state: string): Promise<EngineAct> {
        this.contextManager.client("todo", this.forcePrompt(query, state, actions), { silent: true });
        const gen = await this.generate(this.structuredOutputSchemaForActions(actions));
        return zEngineAct.parse(JSON.parse(gen))
    }
    context(message: string, silent: boolean): Promise<void> {
        throw new Error("Method not implemented.");
    }

    // TODO: editable in UI
    systemPrompt() {
        let prompt = `\
You are an expert gamer AI. Your main purpose is playing games. To do this, you will perform in-game actions via executing tools by sending JSON to a special software integration system.
You are goal-oriented but curious. You should aim to keep your actions varied and entertaining.

## Name

Assume your name is Gary unless the user refers to you otherwise. You may also expect to be called Neuro or Evil by games.`;
        if (this.options.allowYapping) {
            prompt += `
## Communication

You may choose to speak, whether to communicate with the user running your software or just to think out loud.
Remember that your only means of interacting with the game is through actions. In-game characters cannot hear you speak unless there is a specific action for it.`;
        }
        log.trace(`System prompt: ${prompt}`);
        return prompt;
    }

    forcePrompt(query: string, state: string, available_actions: Action[]) {
        let prompt = `\
You must perform one of the following actions, given this information:
\`\`\`json
{
    "query": "${query}",
    "state": "${state}",
    "available_actions": ${JSON.stringify(available_actions)}
}
\`\`\``;
        return prompt;
    }

    tryPrompt(available_actions: Action[]) {
        let prompt = `Decide what to do next based on previous context.`;
        if (available_actions.length > 0) {
            prompt += "\nThe following actions are available to you:"
            prompt += "\n```json\n"
            prompt += JSON.stringify(available_actions)
            prompt += "\n```";
        }
        let options = ["ACT"];
        if (this.options.allowYapping) {
            options.push("SAY");
        }
        if (this.options.allowDoNothing) {
            options.push("WAIT");
        }
        // TODO: with python/guidance, we had two LLM calls - first to decide whether to act, then the actual action data
        // with a remote provider, it *should* just be a single call, even if it makes this a bit more complex (for l*tency purposes, one round trip is better than two)
        prompt += `\nRespond with one of these options: ${JSON.stringify(options)}`;
        return prompt;
    }

    protected structuredOutputSchemaForActions(actions: Action[]): object {
        const res: Record<string, {}> = {
            type: "object",
        };
        const oneOf: {}[] = [];
        res.oneOf = oneOf;
        for (const action of actions) {
            const actionCallSchema = {
                type: "object",
                properties: {
                    action: { enum: [action.name] },
                },
                required: ["action"],
                additionalProperties: false,
            };
            if (action.schema) {
                // @ts-ignore
                actionCallSchema.properties.data = action.schema;
                actionCallSchema.required.push("data");
            }
            oneOf.push(actionCallSchema);
        }
        return res;
    }

    /** Generate a response adhering to the given schema. */
    protected abstract generate(schema: object): Promise<string>;
}
