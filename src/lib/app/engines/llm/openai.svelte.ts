import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { ConfigError, LLMEngine, zLLMOptions, type OpenAIContext } from "./index.svelte";
import { zActorSource, zMessage, type Message } from "$lib/app/context.svelte";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import z from "zod";
import { err, errAsync, ok, type Result, ResultAsync } from "neverthrow";
import { EngineError, type EngineActError, type EngineActResult } from "../index.svelte";
import type { Action } from "$lib/api/v1/spec";
import r from "$lib/app/utils/reporting";
import { parseError } from "$lib/app/utils";
import type { EventDef } from "$lib/app/events";
import { v4 as uuid } from "uuid";

/** Generic engine for OpenAI-compatible servers (e.g. Ollama/LMStudio) instantiated from user-created profiles.
 * This engine type may have multiple instances active at once, each with a generated ID and a user-defined name.
 */
export class OpenAIEngine extends LLMEngine<OpenAIPrefs> {
    readonly name: string;
    private readonly client: OpenAIClient;

    constructor(userPrefs: UserPrefs, engineId: string) {
        super(userPrefs, engineId);
        this.name = $derived(this.options.name);

        const self = this;
        this.client = new OpenAIClient({get prefs() { return self.options; }}, engineId);
    }

    generateStructuredOutput(context: OpenAIContext, outputSchema?: JSONSchema, signal?: AbortSignal) : ResultAsync<Message, EngineActError> {
        return new ResultAsync(this.client.genJson(context, outputSchema, undefined, signal));
    }

    generateToolCall(_context: OpenAIContext, _actions: Action[]): ResultAsync<EngineActResult, EngineActError> {
        return errAsync(new EngineError("Tool calling not implemented", undefined, false));
    }
}

export const zOpenAIPrefs = z.looseObject({
    name: z.string().nonempty(),
    ...zLLMOptions.shape,
    /** Leave empty if your server doesn't need authentication. (e.g. local) */
    apiKey: z.string().default("").sensitive(),
    serverUrl: z.url().default("https://api.openai.com/v1").sensitive(),
    modelId: z.string().optional(),
});

export type OpenAIPrefs = z.infer<typeof zOpenAIPrefs>;

// At some point we migrated OpenRouter from its own (beta) SDK back to just using the OpenAI-compatible API
// It started to look a bit too similar after that... the refactoring itch was irresistible
export class OpenAIClient {
    private readonly client: OpenAI;
    private readonly options: OpenAIPrefs;
    constructor(reactivePrefs: {prefs: OpenAIPrefs}, private id: string) {
        this.options = $derived(reactivePrefs.prefs);
        this.client = new OpenAI({
            apiKey: this.options.apiKey ?? "-", // throws if key is empty
            dangerouslyAllowBrowser: true,
            baseURL: this.options.serverUrl,
        });
    }

    get name() {
        return this.options.name;
    }

    async genJson(
        messages: OpenAIContext,
        outputSchema?: JSONSchema,
        extraParams?: Record<string, any>,
        signal?: AbortSignal,
    ): Promise<Result<Message, EngineActError>> {
        const model = this.options.modelId;
        if (!model) {
            return err(new ConfigError(`${this.name} is missing a model ID`));
        }

        const params: ChatCompletionCreateParamsNonStreaming = {
            model,
            messages,
            reasoning_effort: "none",
            stream: false,
            ...extraParams,
        };

        if (outputSchema) {
            params.response_format = {
                type: "json_schema",
                json_schema: {
                    name: "gary_action",
                    schema: outputSchema as Record<string, unknown>,
                    strict: true,
                },
            };
        }
        // ooga booga me no have reactivity because can be instantiate at runtime, outside root effect
        // so me use pull model instead of push model. hoh
        // me just know seniorberry shake head and wag finger from inside cloud, but me the one that feel alive
        this.client.baseURL = this.options.serverUrl;
        this.client.apiKey = this.options.apiKey;

        // after evaluating tools/responses api - it all sucks bad
        // ollama only just started to support it (but not `tool_choice` - so, still useless to us)
        // lmstudio has responses (allegedly stateful) but doesn't support `strict` in tool definitions (ouch)
        // it also doesn't seem to constrain generation with `text.format` at all?
        // so... `response_format` on `chat/completions` it is
        console.warn("Full request params:", params);
        console.log("Origin:", origin);
        const res = await ResultAsync.fromPromise(
            this.client.chat.completions.create(params, { signal }),
            (error) => new EngineError(`${this.name} request failed: ${error}`, error as Error, false),
        );
        if (signal?.aborted) {
            return err("cancelled");
        }
        console.log("Response:", res);
        if (res.isErr()) {
            return err(res.error);
        }
        const response = res.value;
        type RespOrError = typeof response | { choices?: never, error: any };
        const resp = (response as RespOrError).choices?.[0];
        if (!resp) {
            return err(new EngineError(`${this.name} did not return successful result`, parseError(res.value)));
        }
        if (resp.finish_reason !== "stop" && resp.finish_reason !== "length") {
            return err(new EngineError(`${this.name} returned unexpected finish_reason '${resp.finish_reason}'`, undefined, false))
        }
        const textOutput = resp?.message?.content;
        const reasoning = (resp.message as any)?.reasoning;
        if (!textOutput) {
            r.error(`Empty response from '${this.name}'`, {
                toast: false,
                ctx: { response },
            });
            return err(new EngineError(`${this.name} returned no text`, undefined, true));
        }
        const msg = zMessage.decode({
            text: textOutput,
            source: zActorSource.decode({engineId: this.id}),
            silent: true,
            customData: {
                [this.id]: { response, reasoning, },
            },
        });
        return ok(msg);
    }
}

export const EVENTS = [
    {
        key: 'app/engines/llm/network_error',
    },
    {
        key: 'app/engines/llm/error_result',
    },
    {
        key: 'app/engines/llm/assert', // e.g. "empty response" or "unexpected finish_reason"
    },
    {
        key: 'app/engines/llm/request',
        dataSchema: z.object({
            reqId: z.string().prefault(uuid),
            // TODO: request data
        }),
    },
    {
        key: 'app/engines/llm/response',
        dataSchema: z.object({
            reqId: z.string(),
            // TODO: response data
        }),
    },
] as const satisfies EventDef<'app/engines/llm'>[];
