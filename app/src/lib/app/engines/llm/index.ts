import type { Action } from "$lib/api/v1/spec";
import * as log from "@tauri-apps/plugin-log";
import { Engine, zEngineAct, type EngineAct } from "..";
import type { Session } from "$lib/app/session.svelte";
import type { ContextManager, Message } from "$lib/app/context.svelte";
import type { JSONSchema } from "openai/lib/jsonschema";
import z from "zod";
import { zConst } from "$lib/app/utils.svelte";
import type { Message as OpenAIMessage } from "@openrouter/sdk/models";

export interface CommonLLMOptions {
    /** Let the model choose to do nothing (skip acting) if not forced. Approximates the model getting distracted calling other unrelated tools. */
    allowDoNothing?: boolean;
    /** Let the model trauma dump about its horrid life circumstances instead of doing something useful to society. Approximates realistic human behavior. */
    allowYapping?: boolean;
}

export type OpenAIContext = OpenAIMessage[];

export abstract class LLMEngine<TOptions extends CommonLLMOptions> extends Engine<TOptions> {
    abstract name: string;

    constructor(options: TOptions) {
        super(options);
    }
    
    try_act(session: Session, actions: Action[]): Promise<EngineAct | null> {
        throw new Error("Method not implemented.");
    }
    async force_act(session: Session, actions: Action[], query: string, state: string): Promise<EngineAct> {
        // don't write to context, it will be prepared from outside
        const ctx = this.convertContext(session.context);
        const schema = this.structuredOutputSchemaForActions(actions);
        const gen = await this.generate(ctx, schema);
        gen.visibilityOverrides = {user: false, engine: false}; // TODO: maybe don't need
        return zEngineAct.parse(JSON.parse(gen.text));
    }

    // TODO: editable in UI
    systemPrompt() {
        let prompt = `\
You are an expert gamer AI. Your main purpose is playing games. To do this, you will perform in-game actions via JSON function calls to a special software integration system.
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

    protected structuredOutputSchemaForActions(actions: Action[]): JSONSchema {
        const acts: JSONSchema = {
            type: "object",
        };
        const actsAnyOf: JSONSchema[] = [];
        acts.anyOf = actsAnyOf;
        for (const action of actions) {
            const actionCallSchema: JSONSchema = {
                type: "object",
                properties: {
                    action: { enum: [action.name] },
                },
                required: ["action"],
                additionalProperties: false,
            };
            if (action.schema) {
                // TODO: openai quirks
                // https://platform.openai.com/docs/guides/structured-outputs#all-fields-must-be-required
                // https://platform.openai.com/docs/guides/structured-outputs#additionalproperties-false-must-always-be-set-in-objects
                actionCallSchema.properties!.data = action.schema;
                actionCallSchema.required!.push("data");
            }
            actsAnyOf.push(actionCallSchema);
        }
        const cmdAnyOf: JSONSchema[] = [{
            description: "Perform an action.",
            anyOf: actsAnyOf,
        }];
        const main: JSONSchema = {
            type: "object",
            description: "Choose a command to execute.",
            properties: {
                command: { anyOf: cmdAnyOf },
            },
            required: ["command"],
            additionalProperties: false,
        }
        if (this.options.allowDoNothing) {
            cmdAnyOf.push(z.toJSONSchema(zWait) as any);
        }
        if (this.options.allowYapping) {
            cmdAnyOf.push(z.toJSONSchema(zSay) as any);
        }
        return main;
    }

    /** Generate a response adhering to the given schema. */
    protected abstract generate(context: OpenAIContext, schema: object): Promise<Message>;

    private convertMessage(msg: Message) {
        let text = msg.text;
        let role: OpenAIMessage['role'];
        switch (msg.source.type) {
            case "system":
                role = "system";
                text = `System: ${text}`;
                break;
            case "client":
                role = "user";
                text = `Game (${msg.source.name}): ${text}`;
                break;
            case "user":
                role = "user";
                text = `User: ${text}`;
                break;
            case "actor":
                role = "assistant";
                break;
        }
        if (!role) {
            throw new Error("Invalid message source");
        }
        return {
            role,
            content: text,
        }
    }
    private convertContext(ctx: ContextManager): OpenAIContext {
        return ctx.actorView.map(msg => this.convertMessage(msg));
    }
}

export const zWait = zConst("wait").describe("Do nothing.");
export const zSay = z.strictObject({
    say: z.string()
        .describe("The text to say out loud."),
    notify: z.boolean().optional().default(false)
        .describe("Whether this message requires the user's attention."),
}).describe("Speak out loud to the user.");
