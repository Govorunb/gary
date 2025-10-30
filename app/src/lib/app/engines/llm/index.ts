import type { Action } from "$lib/api/v1/spec";
import * as log from "@tauri-apps/plugin-log";
import { Engine, zEngineAct, type EngineAct } from "../index.svelte";
import type { Session } from "$lib/app/session.svelte";
import type { ContextManager, Message } from "$lib/app/context.svelte";
import type { JSONSchema } from "openai/lib/jsonschema";
import z from "zod";
import { zConst } from "$lib/app/utils.svelte";
import type { Message as OpenAIMessage } from "@openrouter/sdk/models";

export const zLLMOptions = z.strictObject({
    /** Let the model choose to do nothing (skip acting) if not forced. Approximates the model getting distracted calling other unrelated tools. */
    allowDoNothing: z.boolean().default(false),
    /** Let the model trauma dump about its horrid life circumstances instead of doing something useful to society. Approximates realistic human behavior. */
    allowYapping: z.boolean().default(false),
});

export type CommonLLMOptions = z.infer<typeof zLLMOptions>;

export type OpenAIContext = OpenAIMessage[];

export abstract class LLMEngine<TOptions extends CommonLLMOptions> extends Engine<TOptions> {
    abstract name: string;

    tryAct(session: Session, actions?: Action[]): Promise<EngineAct | null> {
        return this.actInner(session, actions, false);
    }
    async forceAct(session: Session, actions?: Action[]): Promise<EngineAct> {
        const act = await this.actInner(session, actions, true);
        if (!act) {
            throw new Error("Force act did not act");
        }
        return act;
    }

    async actInner(session: Session, actions?: Action[], isForce: boolean = false) {
        const resolvedActions = this.resolveActions(session, actions);
        if (isForce && !resolvedActions.length) {
            throw new Error("Tried to force act with no available actions");
        }
        const ctx = this.convertContext(session.context);
        const schema = this.structuredOutputSchemaForActions(resolvedActions, isForce);
        const gen = await this.generate(ctx, schema);
        // FIXME: JSON.parse can fail here (unterminated string)
        console.log(gen);
        console.log(gen.text);
        const command = JSON.parse(gen.text)['command'];
        console.log(command);
        if (zWait.safeParse(command).success) {
            if (isForce) {
                throw new Error("Internal error - force act allowed waiting");
            }
            return null;
        }
        if (zSay.safeParse(command).success) {
            if (isForce) {
                throw new Error("Internal error - force act allowed yapping");
            }
            // TODO: insert into context
            return null;
        }
        return zEngineAct.parse({
            name: command['action'],
            data: JSON.stringify(command['data']),
        });
    }

    // TODO: configurable prompts (editor?)
    systemPrompt() {
        let prompt = `\
You are an expert gamer AI. Your main purpose is playing games. To do this, you will perform in-game actions via JSON function calls to a special software integration system.
You are goal-oriented and curious. You should aim to keep your actions varied and entertaining.

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

    protected structuredOutputSchemaForActions(actions: Action[], isForce: boolean = false): JSONSchema {
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
        if (!isForce && this.options.allowDoNothing) {
            cmdAnyOf.push(z.toJSONSchema(zWait) as any);
        }
        if (!isForce && this.options.allowYapping) {
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
                role = "developer";
                text = `System: ${text}`;
                break;
            case "client":
                role = "user";
                text = `Game (${msg.source.name}): ${text}`; // TODO: escape
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
