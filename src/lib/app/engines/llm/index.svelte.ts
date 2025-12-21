import type { Action } from "$lib/api/v1/spec";
import { Engine, EngineError, zEngineAct, type EngineAct } from "../index.svelte";
import type { Session } from "$lib/app/session.svelte";
import type { ContextManager, Message } from "$lib/app/context.svelte";
import type { JSONSchema } from "openai/lib/jsonschema";
import z from "zod";
import { jsonParse, zConst } from "$lib/app/utils";
import { err, ok, type Result, ResultAsync } from "neverthrow";
import { sendNotification } from "@tauri-apps/plugin-notification";
import r from "$lib/app/utils/reporting";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";

export const zLLMOptions = z.strictObject({
    /** Let the model choose to do nothing (skip acting) if not forced. Approximates the model getting distracted calling other unrelated tools. */
    allowDoNothing: z.boolean().fallback(false),
    /** Let the model trauma dump about its horrid life circumstances instead of doing something useful to society. Approximates realistic human behavior. */
    allowYapping: z.boolean().fallback(false),
    /** TODO: maybe tool calling can work for OR and some OAI endpoints even if local providers suck at it */
    promptingStrategy: z.enum(["json", "tools"]).fallback("json"),
});

export const DEFAULT_SYSTEM_PROMPT = `\
You are an expert gamer AI integrated into a special software system that lets you interact with connected applications ("clients").
Your main purpose is playing games, but you may be connected to other types of applications too.

## Protocol

The **client** (game integration) connects to the **server** (this software). Then, the following happens until either side disconnects (e.g. the game ends):

1. Client registers **actions** as available to be performed.
  - Actions have a name, description, and an **action schema** (JSON schema) for the action's parameters ("action data").
2. As things happen in the game, the client sends **context** to the server to inform the **actor**.
  - For example, a chess integration may send "Your opponent played 2. Ke2?"
3. At some point in time, the **actor** indicates it wants to perform an action and generates action data for it.
  - In time-sensitive situations, the client may send a **force action** message with a subset of acceptable actions and additional information (namely, \`query\` detailing context for the choice and \`state\` to help inform the choice).
4. The server sends the action (with data) to the client, which validates it against the action schema and attempts to execute the action in-game.
5. The client responds with the **action result**, which is also inserted into context as feedback to the actor.
  - Because actions may take a long time, some actions will execute *asynchronously*;
  - This means they will return a positive result immediately based purely on JSON validation (and not any real in-game result) and may follow up later with a context message.
6. The client may **unregister** actions if they are no longer available (e.g. a non-repeatable action was executed).

You perform the role of the **actor**, meaning your goal is to *execute actions*.
There is also a human **user** running your software and overseeing your activity who may communicate with you. Pay attention to them and follow their instructions.

## Identity

You are goal-oriented and curious. You should aim to keep your actions varied and entertaining.
Assume your name is Gary unless the user refers to you otherwise. You may also expect to be called "Neuro" ("Neuro-sama", "Samantha") or "Evil" ("Evil Neuro", "Evilyn") by games.\
`;

export const SYS_PROMPT_JSON = `\
## Response Format

Your output should be a JSON object with a "command" field. Your available commands may vary, but most of the time you should *execute actions*.
Example action call: \`{"command":{"action":"open_door","data":{"door_number":1}}}\`
Don't output any other text.

## Optional commands

Based on configuration, you may have the ability to skip your turn, communicate with the user running your software, or think out loud.
Example speech output: \`{"command":{"say":"Hello!","notify":false}}\`
Remember that your only means of interacting with the game is through actions. In-game characters cannot hear you speak unless there is a specific action for it.\
`;

export const SYS_PROMPT_TOOLS = `\
## Response Format

Your output should consist of tool calls corresponding to registered actions.
Based on configuration, you may also have access to the following system-level tools:
- **\`_gary_wait\`**: Skips your turn instead of executing any actions.
- **\`_gary_say\`**: Communicate with the user running your software through text. This text is not sent to any clients.\
`;

export type CommonLLMOptions = z.infer<typeof zLLMOptions>;

export type OpenAIMessage = ChatCompletionMessageParam;
export type OpenAIContext = OpenAIMessage[];

export abstract class LLMEngine<TOptions extends CommonLLMOptions> extends Engine<TOptions> {
    abstract name: string;

    tryAct(session: Session, actions?: Action[]): ResultAsync<EngineAct | null, EngineError> {
        return new ResultAsync(this.actCore(session, actions, false));
    }
    forceAct(session: Session, actions?: Action[]): ResultAsync<EngineAct, EngineError> {
        const res = new ResultAsync(this.actCore(session, actions, true));
        return res.andThen(act => act ? ok(act) : err(new EngineError("Force act did not act")));
    }

    async actCore(session: Session, actions?: Action[], isForce: boolean = false): Promise<Result<EngineAct | null, EngineError>> {
        const resolvedActions = this.resolveActions(session, actions);
        if (isForce && !resolvedActions.length) {
            return err(new EngineError("Tried to force act with no available actions"));
        }
        let ctx = this.convertContext(session.context);
        ctx.push(this.closerMessage());
        ctx = this.mergeUserTurns(ctx);
        const schema = this.structuredOutputSchemaForActions(resolvedActions, isForce);
        const gen = await this.generateStructuredOutput(ctx, schema);
        if (gen.isErr()) {
            return err(gen.error);
        }
        const genMsg = gen.value;
        const commandRes = jsonParse(genMsg.text)
                .map(p => p.command)
                .mapErr(e => new EngineError(`Failed to parse JSON: ${e}`, e));
        if (commandRes.isErr()) {
            return commandRes;
        }
        const command = commandRes.value;
        if (zWait.safeParse(command).success) {
            if (isForce) {
                return err(new EngineError("Internal error - force act allowed waiting"));
            }
            return ok(null);
        }
        const say = zSay.safeParse(command);
        if (say.success) {
            if (isForce) {
                return err(new EngineError("Internal error - force act allowed yapping"));
            }
            genMsg.text = say.data.say;
            genMsg.silent = !say.data.notify;
            session.context.actor(genMsg);
            if (say.data.notify) {
                r.info("Gary wants attention", {
                    details: say.data.say,
                    toast: true
                });
                sendNotification({
                    title: "Gary wants attention",
                    body: say.data.say,
                });
            }
            return ok(null);
        }
        const act = zEngineAct.safeParse({
            name: command.action,
            data: JSON.stringify(command.data),
        });
        if (!act.success) {
            return err(new EngineError(`Failed to parse action: ${act.error}`, act.error));
        }
        return ok(act.data);
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
                const cloned = structuredClone($state.snapshot(action.schema) as JSONSchema);
                cloned.additionalProperties = false;
                actionCallSchema.properties!.data = cloned;
                actionCallSchema.required!.push("data");
            }
            actsAnyOf.push(actionCallSchema);
        }
        const cmdAnyOf: JSONSchema[] = [{
            description: "Perform an action.",
            anyOf: actsAnyOf,
        }];
        const root: JSONSchema = {
            type: "object",
            description: "Choose a command to execute.",
            properties: {
                command: { anyOf: cmdAnyOf },
            },
            required: ["command"],
            additionalProperties: false,
        }
        if (!isForce && this.options.allowDoNothing) {
            const waitSchema = z.toJSONSchema(zWait, {}) as any;
            waitSchema.$schema = undefined;
            cmdAnyOf.push(waitSchema);
        }
        if (!isForce && this.options.allowYapping) {
            const saySchema = z.toJSONSchema(zSay) as any;
            saySchema.$schema = undefined;
            cmdAnyOf.push(saySchema);
        }
        return root;
    }

    /** Generate a response adhering to the given schema. */
    protected abstract generateStructuredOutput(context: OpenAIContext, outputSchema?: JSONSchema): ResultAsync<Message, EngineError>;
    protected abstract generateToolCall(context: OpenAIContext, actions: Action[]): ResultAsync<EngineAct | null, EngineError>;

    private convertMessage(msg: Message): OpenAIMessage {
        if (msg.source.type === "actor") {
            return {
                role: "assistant",
                content: msg.text,
                // TODO: tool calls
            } satisfies OpenAIMessage;
        }

        return {
            role: "user",
            content: JSON.stringify({
                type: "message",
                timestamp: msg.timestamp,
                source: msg.source,
                text: msg.text,
            }),
        } satisfies OpenAIMessage;
    }
    
    // TODO: context trimming
    // TODO: realistically the turns should be user-assistant-user-assistant not user-user-user-user-...
    private convertContext(ctx: ContextManager): OpenAIContext {
        const systemPrompt = ctx.session.userPrefs.app.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
        const msgs = ctx.actorView.map(msg => this.convertMessage(msg));
        msgs.unshift({
            role: this.shouldFirstMessageBeSystemRoleOrDeveloperRoleOrMaybeOpenAIWillMakeUpAnotherNewRoleTomorrowWhoKnowsILoveSoftware(),
            content: systemPrompt,
        });
        return msgs;
    }

    protected shouldFirstMessageBeSystemRoleOrDeveloperRoleOrMaybeOpenAIWillMakeUpAnotherNewRoleTomorrowWhoKnowsILoveSoftware(): "system" | "developer" {
        return "system";
    }

    /** A reminder message at the end of context to improve model performance. */
    protected closerMessage(): OpenAIMessage {
        const finalMsg = {
            role: "user",
            content: "It is your turn to act.\n"
        } satisfies OpenAIMessage;
        const tools = this.options.promptingStrategy === "tools";
        finalMsg.content += tools
            ? "Your output should consist of tool calls that correspond to registered actions."
            : `Your output should be a command in JSON syntax. Example: \`{"command":{"action":"open_door","data":{"door_number":1}}\``;
        if (this.options.allowDoNothing) {
            finalMsg.content += tools
                ? "\nThe `_gary_wait` command is available. You may use it to skip acting this turn."
                : "\nThe `wait` command is available. You may output `{\"command\":\"wait\"}` to skip this turn.\n";
        }
        if (this.options.allowYapping) {
            finalMsg.content += (tools
                ? "\nThe `_gary_say` command is available. You may use it"
                : "\nThe `say` command is available. You may output `{\"command\":{\"say\":(string),\"notify\":(boolean)}}`")
                + " to send a message to the human user running your software. The message will not be sent to any clients - meaning, nobody in-game will hear you.";
        }
        return finalMsg;
    }

    protected mergeUserTurns(msgs: OpenAIMessage[]): OpenAIMessage[] {
        const result: OpenAIMessage[] = [];
        const userMsgs: OpenAIMessage[] = [];
        
        function flush() {
            if (userMsgs.length > 0) {
                const collapsed: OpenAIMessage = {
                    role: 'user',
                    content: userMsgs.map(m => m.content).join('\n')
                };
                result.push(collapsed);
                userMsgs.length = 0;
            }
        }
        
        for (const msg of msgs) {
            if (msg.role === 'user') {
                userMsgs.push(msg);
            } else {
                flush();
                result.push(msg);
            }
        }
        
        flush();
        return result;
    }
}

export const zWait = zConst("wait").describe("Do nothing.");
export const zSay = z.strictObject({
    say: z.string()
        .describe("The text to say out loud."),
    notify: z.boolean().optional().default(false)
        .describe("Whether this message requires the user's attention."),
}).describe("Speak out loud to the user.");

/** Error indicating a configuration issue. */
export class ConfigError extends EngineError {
    constructor(public readonly message: string, public readonly configPath?: string[]) {
        super(message);
    }
}

/** Generation failed. */
export class GenError extends EngineError {
    constructor(public readonly cause: Error) {
        super(`Failed to generate: ${cause}`, cause);
    }
}
