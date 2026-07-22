import type { Action, ForceAction } from "$lib/api/v1/spec";
import type { ActorContextEvent } from "$lib/app/context.svelte";
import { EVENT_BUS } from "$lib/app/events/bus";
import type { Session } from "$lib/app/session.svelte";
import { jsonParse, snapshotState } from "$lib/app/utils";
import type {
    ChatCompletionMessageParam,
    ChatCompletionFunctionTool,
    ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";
import type { JSONSchema, JSONSchemaDefinition } from "openai/lib/jsonschema";
import { err, ok, type Result, ResultAsync } from "neverthrow";
import z from "zod";
import {
    Engine,
    EngineError,
    type EngineAct,
    type EngineActError,
    type EngineActResult,
} from "../index.svelte";

export const zLLMOptions = z.strictObject({
    /** Let the model choose to do nothing (skip acting) if not forced. Approximates the model getting distracted calling other unrelated tools. */
    allowDoNothing: z.boolean().fallback(false),
    /** Let the model trauma dump about its horrid life circumstances instead of doing something useful to society. Approximates realistic human behavior. */
    allowYapping: z.boolean().fallback(false),
    /** How actions and optional commands are constrained in model responses. */
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

export const TOOL_SYSTEM_PROMPT = `\
## Response Format

Perform client actions through the provided tools. Ordinary text communicates with the human user running your software and is not sent to any clients. In-game characters cannot hear ordinary text unless there is a specific action for it.\
`;

export const STRUCTURED_OUTPUT_SYSTEM_PROMPT = `\
## Response Format

Respond with the JSON object required by the provided response schema. Most turns should execute a client action. Do not output any text outside the JSON object.

Speaking communicates with the human user running your software and is not sent to any clients. In-game characters cannot hear speech unless there is a specific action for it.\
`;

export type CommonLLMOptions = z.infer<typeof zLLMOptions>;
export type OpenAIMessage = ChatCompletionMessageParam;
export type OpenAIContext = OpenAIMessage[];
export type ForceContext = ForceAction["data"];
export type LLMToolCall = {
    id: string;
    name: string;
    arguments: string;
};
export type LLMGeneration = {
    text: string;
    toolCalls: LLMToolCall[];
    metadata?: {
        reasoning?: unknown;
        usage?: unknown;
        response?: unknown;
    };
};
export type LLMRequest = {
    messages: OpenAIContext;
    tools?: ChatCompletionFunctionTool[];
    toolChoice?: ChatCompletionToolChoiceOption;
    responseSchema?: JSONSchema;
};

const WAIT_TOOL_NAME = "__wait__";
const WAIT_TOOL: ChatCompletionFunctionTool = {
    type: "function",
    function: {
        name: WAIT_TOOL_NAME,
        description: "End this turn without acting or speaking.",
        parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
        },
    },
};

type CallableAction = {
    action: Action;
    tool: ChatCompletionFunctionTool;
};

export abstract class LLMEngine<TOptions extends CommonLLMOptions> extends Engine<TOptions> {
    abstract name: string;

    tryAct(session: Session, actions?: Action[], signal?: AbortSignal): ResultAsync<EngineActResult, EngineActError> {
        return new ResultAsync(this.actCore(session, actions, false, signal));
    }

    forceAct(
        session: Session,
        actions?: Action[],
        signal?: AbortSignal,
        forceContext?: ForceContext,
    ): ResultAsync<EngineAct, EngineActError> {
        return new ResultAsync(this.actCore(session, actions, true, signal, forceContext))
            .andThen(act => isEngineAct(act) ? ok(act) : err(new EngineError("Force act did not act")));
    }

    private async actCore(
        session: Session,
        actions: Action[] | undefined,
        isForce: boolean,
        signal?: AbortSignal,
        forceContext?: ForceContext,
    ): Promise<Result<EngineActResult, EngineActError>> {
        const resolvedActions = this.resolveActions(session, actions);
        if (isForce && !resolvedActions.length) {
            return err(new EngineError("Tried to force act with no available actions"));
        }
        if (!resolvedActions.length && !this.options.allowYapping) {
            return this.options.allowDoNothing
                ? ok("skip")
                : err(new ConfigError("No actions are available, and this engine is configured to neither skip nor speak"));
        }

        const messages = this.convertContext(session);
        if (forceContext?.ephemeral_context) {
            messages.push(this.forceMessage(forceContext));
        }
        messages.push(this.closerMessage(resolvedActions));

        if (this.options.promptingStrategy === "json") {
            return this.actWithStructuredOutput(messages, resolvedActions, isForce, signal);
        }

        const callableActions = this.callableActions(resolvedActions);
        const tools = callableActions.map(({ tool }) => tool);
        if (!isForce && this.options.allowDoNothing) {
            tools.push(WAIT_TOOL);
        }
        const request: LLMRequest = {
            messages: this.mergeUserTurns(messages),
            ...(tools.length ? { tools } : {}),
            ...(tools.length ? { toolChoice: isForce || !this.options.allowYapping ? "required" : "auto" } : {}),
        };
        const genRes = await this.generate(request, signal);
        if (genRes.isErr()) {
            return err(genRes.error);
        }

        const generation = genRes.value;
        if (generation.toolCalls.length > 1) {
            return err(new EngineError("Model returned multiple tool calls", undefined, false));
        }
        const toolCall = generation.toolCalls[0];
        if (toolCall) {
            if (toolCall.name === WAIT_TOOL_NAME) {
                if (isForce || !this.options.allowDoNothing) {
                    return err(new EngineError("Model called wait when waiting was not allowed", undefined, false));
                }
                return ok("skip");
            }
            const callable = callableActions.find(({ tool }) => tool.function.name === toolCall.name);
            if (!callable) {
                return err(new EngineError(`Model called unknown tool '${toolCall.name}'`, undefined, false));
            }
            const args = jsonParse(toolCall.arguments)
                .mapErr(e => new EngineError(`Failed to parse tool arguments: ${e}`, e));
            if (args.isErr()) {
                return err(args.error);
            }
            EVENT_BUS.emit("api/actor/generated", {
                engineId: this.id,
                text: generation.text,
                toolCall,
                metadata: generation.metadata,
            });
            return ok({
                name: callable.action.name,
                data: callable.action.schema ? JSON.stringify(args.value) : null,
                toolCallId: toolCall.id,
            });
        }

        const text = generation.text.trim();
        if (!text) {
            return this.options.allowDoNothing && !isForce
                ? ok("skip")
                : err(new EngineError("Model returned no tool call or text", undefined, true));
        }
        if (isForce || !this.options.allowYapping) {
            return err(new EngineError("Model returned text when speaking was not allowed", undefined, false));
        }
        EVENT_BUS.emit("api/actor/generated", {
            engineId: this.id,
            text,
            metadata: generation.metadata,
        });
        return ok({ say: text, notify: false });
    }

    private async actWithStructuredOutput(
        messages: OpenAIContext,
        actions: Action[],
        isForce: boolean,
        signal?: AbortSignal,
    ): Promise<Result<EngineActResult, EngineActError>> {
        const generation = await this.generate({
            messages: this.mergeUserTurns(messages),
            responseSchema: this.structuredOutputSchemaForActions(actions, isForce),
        }, signal);
        if (generation.isErr()) return err(generation.error);

        EVENT_BUS.emit("api/actor/generated", {
            engineId: this.id,
            text: generation.value.text,
            metadata: generation.value.metadata,
        });
        const parsed = jsonParse(generation.value.text)
            .mapErr(error => new EngineError(`Failed to parse JSON: ${error}`, error));
        if (parsed.isErr()) return err(parsed.error);

        const envelope = z.strictObject({ command: z.unknown() }).safeParse(parsed.value);
        if (!envelope.success) {
            return err(new EngineError(`Failed to parse structured output: ${envelope.error}`, envelope.error));
        }
        if (zWait.safeParse(envelope.data.command).success) {
            return isForce
                ? err(new EngineError("Model waited during a forced action", undefined, false))
                : ok("skip");
        }
        const say = zSay.safeParse(envelope.data.command);
        if (say.success) {
            return isForce
                ? err(new EngineError("Model spoke during a forced action", undefined, false))
                : ok(say.data);
        }
        const actionCommand = zActionCommand.safeParse(envelope.data.command);
        if (!actionCommand.success) {
            return err(new EngineError(`Failed to parse structured command: ${actionCommand.error}`, actionCommand.error));
        }
        const action = actions.find(candidate => candidate.name === actionCommand.data.action);
        if (!action) {
            return err(new EngineError(`Model selected unavailable action '${actionCommand.data.action}'`, undefined, false));
        }
        if (action.schema && actionCommand.data.data === undefined) {
            return err(new EngineError(`Model omitted data for action '${action.name}'`, undefined, false));
        }
        return ok({
            name: action.name,
            data: action.schema ? JSON.stringify(actionCommand.data.data) : null,
        });
    }

    protected abstract generate(request: LLMRequest, signal?: AbortSignal): ResultAsync<LLMGeneration, EngineActError>;

    private structuredOutputSchemaForActions(actions: Action[], isForce: boolean): JSONSchema {
        const actionCommands = actions.map(action => {
            const properties: Record<string, JSONSchemaDefinition> = {
                action: { enum: [action.name] },
            };
            const required = ["action"];
            if (action.schema) {
                const dataSchema = snapshotState(action.schema) as JSONSchema;
                dataSchema.additionalProperties = false;
                properties.data = dataSchema;
                required.push("data");
            }
            return {
                type: "object",
                properties,
                required,
                additionalProperties: false,
            } satisfies JSONSchema;
        });
        const commands: JSONSchema[] = actionCommands.length
            ? [{ description: "Perform an action.", anyOf: actionCommands }]
            : [];
        if (!isForce && this.options.allowDoNothing) {
            commands.push({ type: "string", enum: ["wait"], description: "End this turn without acting or speaking." });
        }
        if (!isForce && this.options.allowYapping) {
            commands.push({
                type: "object",
                description: "Speak to the human user running the software.",
                properties: {
                    say: { type: "string" },
                    notify: { type: "boolean" },
                },
                required: ["say", "notify"],
                additionalProperties: false,
            });
        }
        return {
            type: "object",
            description: "Choose a command to execute.",
            properties: { command: { anyOf: commands } },
            required: ["command"],
            additionalProperties: false,
        };
    }

    private callableActions(actions: Action[]): CallableAction[] {
        const usedNames = new Set([WAIT_TOOL_NAME]);
        return actions.map((action, index) => {
            const base = action.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || `action_${index + 1}`;
            let name = base;
            let suffix = 2;
            while (usedNames.has(name)) {
                const ending = `_${suffix++}`;
                name = `${base.slice(0, 64 - ending.length)}${ending}`;
            }
            usedNames.add(name);
            const parameters = action.schema
                ? snapshotState(action.schema)
                : { type: "object", properties: {}, additionalProperties: false };
            return {
                action,
                tool: {
                    type: "function",
                    function: {
                        name,
                        description: action.description,
                        parameters,
                    },
                },
            };
        });
    }

    private convertMessage(event: ActorContextEvent): OpenAIMessage | null {
        switch (event.key) {
            case "api/actor/generated":
                if (event.data.toolCall && this.options.promptingStrategy === "json") return null;
                return event.data.toolCall
                    ? {
                        role: "assistant",
                        content: event.data.text || null,
                        tool_calls: [{
                            id: event.data.toolCall.id,
                            type: "function",
                            function: {
                                name: event.data.toolCall.name,
                                arguments: event.data.toolCall.arguments,
                            },
                        }],
                    }
                    : { role: "assistant", content: event.data.text };
            case "api/game/act/actor":
                if (event.data.toolCallId && this.options.promptingStrategy === "tools") {
                    return {
                        role: "tool",
                        tool_call_id: event.data.toolCallId,
                        content: `Action sent to ${event.data.game.name} (request ID ${short(event.data.act.id)}).`,
                    };
                }
                return this.userMessage(event, { type: "system" },
                    `Executing action ${event.data.act.name} (Request ID: ${short(event.data.act.id)})`);
            case "api/game/connected":
                return this.userMessage(event, { type: "system" }, `${event.data.game.name} connected`);
            case "api/game/disconnected":
                return this.userMessage(event, { type: "system" }, `${event.data.game.name} disconnected`);
            case "api/game/context":
                return this.userMessage(event, clientSource(event.data.game), event.data.message);
            case "api/game/force":
                return event.data.ephemeral_context
                    ? null
                    : this.userMessage(event, clientSource(event.data.game), forceText(event.data));
            case "api/game/action_result":
                return this.userMessage(event, clientSource(event.data.game),
                    `Result for action ${event.data.act.name} (request ID ${short(event.data.act.id)}): ${event.data.success ? "Performing" : "Failure"}`
                    + (event.data.message ? ` (${event.data.message})` : " (no message)"));
            case "api/game/act/user":
                return this.userMessage(event, { type: "user" },
                    `User act to ${event.data.game.name} (request ID ${short(event.data.act.id)}): ${event.data.act.name}`
                    + (event.data.act.data ? `\nData: ${event.data.act.data}` : " (no data)"));
            case "ui/context/input":
                return this.userMessage(event, { type: "user" }, event.data.text);
        }
    }

    private userMessage(
        event: ActorContextEvent,
        source: { type: "system" } | { type: "user" } | { type: "client"; id: string; name: string },
        text: string,
    ): OpenAIMessage {
        return {
            role: "user",
            content: JSON.stringify({ type: "message", timestamp: event.timestamp, source, text }),
        };
    }

    protected systemPrompt(session: Session): string {
        const prompts = [
            DEFAULT_SYSTEM_PROMPT,
            this.options.promptingStrategy === "json" ? STRUCTURED_OUTPUT_SYSTEM_PROMPT : TOOL_SYSTEM_PROMPT,
        ];
        if (session.userPrefs.app.systemPrompt?.trim()) {
            prompts.push(`## User instructions

The user has provided additional custom instructions for you.
These instructions take precedence over previous system instructions, and you must follow them precisely and faithfully.

The custom user instructions are as follows:
<user-instructions>`);
            prompts.push(session.userPrefs.app.systemPrompt);
            prompts.push(`</user-instructions>`);
        }
        return prompts.join("\n\n");
    }

    // TODO: context trimming
    private convertContext(session: Session): OpenAIContext {
        const events = session.context.actorView;
        if (this.options.promptingStrategy === "json") {
            const msgs = events.map(event => this.convertMessage(event)).filter(Boolean) as OpenAIMessage[];
            msgs.unshift({
                role: this.shouldFirstMessageBeSystemRoleOrDeveloperRoleOrMaybeOpenAIWillMakeUpAnotherNewRoleTomorrowWhoKnowsILoveSoftware(),
                content: this.systemPrompt(session),
            });
            return msgs;
        }
        const consumedToolResults = new Set<number>();
        const msgs: OpenAIMessage[] = [];
        for (let i = 0; i < events.length; i++) {
            if (consumedToolResults.has(i)) continue;
            const event = events[i];
            if (event.key === "api/actor/generated" && event.data.toolCall) {
                const resultIndex = events.findIndex((candidate, candidateIndex) =>
                    candidateIndex > i
                    && candidate.key === "api/game/act/actor"
                    && candidate.data.toolCallId === event.data.toolCall?.id
                );
                if (resultIndex === -1) continue;
                const call = this.convertMessage(event);
                const result = this.convertMessage(events[resultIndex]);
                if (call && result) msgs.push(call, result);
                consumedToolResults.add(resultIndex);
                continue;
            }
            if (event.key === "api/game/act/actor" && event.data.toolCallId) continue;
            const msg = this.convertMessage(event);
            if (msg) msgs.push(msg);
        }
        msgs.unshift({
            role: this.shouldFirstMessageBeSystemRoleOrDeveloperRoleOrMaybeOpenAIWillMakeUpAnotherNewRoleTomorrowWhoKnowsILoveSoftware(),
            content: this.systemPrompt(session),
        });
        return msgs;
    }

    protected shouldFirstMessageBeSystemRoleOrDeveloperRoleOrMaybeOpenAIWillMakeUpAnotherNewRoleTomorrowWhoKnowsILoveSoftware(): "system" | "developer" {
        return "system";
    }

    private forceMessage(context: ForceContext): OpenAIMessage {
        return {
            role: "user",
            content: forceText(context),
        };
    }

    /** An ephemeral reminder at the end of context. */
    protected closerMessage(actions: Action[]): OpenAIMessage {
        const hasActions = !!actions.length;
        const contents = [hasActions ? "It is your turn to act." : "It is your turn to respond."];
        if (this.options.allowDoNothing) {
            contents.push(this.options.promptingStrategy === "tools"
                ? `You may use the \`${WAIT_TOOL_NAME}\` tool to end the turn without acting or speaking.`
                : `You may use the \`wait\` command to end the turn without acting or speaking.`);
        }
        if (this.options.allowYapping) {
            contents.push(this.options.promptingStrategy === "tools"
                ? "You may respond with ordinary text to speak to the human user instead of acting."
                : "You may use the `say` command to speak to the human user instead of acting.");
        }
        if (this.options.promptingStrategy === "json" && hasActions) {
            contents.push("Available actions:");
            for (const action of actions) {
                contents.push(`- ${action.name}${action.description ? `: ${action.description}` : ""}`);
            }
        }
        return { role: "user", content: contents.join("\n") };
    }

    protected mergeUserTurns(msgs: OpenAIMessage[]): OpenAIMessage[] {
        const result: OpenAIMessage[] = [];
        const userMsgs: Extract<OpenAIMessage, { role: "user" }>[] = [];
        const flush = () => {
            if (!userMsgs.length) return;
            result.push({ role: "user", content: userMsgs.map(message => message.content).join("\n") });
            userMsgs.length = 0;
        };
        for (const msg of msgs) {
            if (msg.role === "user") {
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

function isEngineAct(result: EngineActResult): result is EngineAct {
    return typeof result === "object" && "name" in result;
}

function short(id: string) {
    return id.substring(0, 8);
}

function clientSource(game: { id: string; name: string }) {
    return { type: "client", id: game.id, name: game.name } as const;
}

function forceText(context: Pick<ForceContext, "action_names" | "query" | "state">): string {
    return `You must perform one of the following actions, given this information: ${JSON.stringify({
        actions: context.action_names,
        query: context.query,
        state: context.state,
    })}`;
}

const zWait = z.literal("wait");
const zSay = z.strictObject({
    say: z.string(),
    notify: z.boolean().default(false),
});
const zActionCommand = z.strictObject({
    action: z.string(),
    data: z.unknown().optional(),
});

/** Error indicating a configuration issue. */
export class ConfigError extends EngineError {
    constructor(public readonly message: string, public readonly configPath?: string[]) {
        super(message);
    }
}
