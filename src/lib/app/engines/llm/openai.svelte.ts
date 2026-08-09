import { ConfigError, LLMEngine, zLLMOptions, type LLMGeneration, type LLMRequest } from ".";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageFunctionToolCall } from "openai/resources/chat/completions";
import z from "zod";
import { err, ok, type Result, ResultAsync } from "neverthrow";
import { EngineError, type EngineActError } from "../index.svelte";
import { parseError, LogLevel } from "$lib/app/utils";
import type { EventDef } from "$lib/app/events";
import { EVENT_BUS } from "$lib/app/events/bus";
import { v4 as uuid } from "uuid";
import { getLMStudioModelMetadata, isLMStudioEngine } from "./lm-studio";
import { getOllamaModelMetadata, isOllamaEngine } from "./ollama";
import { openAICompatFetch } from "./openai-compat";

/** Generic engine for OpenAI-compatible servers (e.g. Ollama/LMStudio) instantiated from user-created profiles.
 * This engine type may have multiple instances active at once, each with a generated ID and a user-defined name.
 */
export class OpenAIEngine extends LLMEngine<OpenAIPrefs> {
    private readonly client: OpenAIClient;

    public get name() {
        return this.options.name;
    }

    constructor(userPrefs: UserPrefs, engineId: string) {
        super(userPrefs, engineId);

        const self = this;
        this.client = new OpenAIClient({
            get prefs() { return self.options; },
            setReasoningEffort(effort) { self.options.reasoningEffort = effort; },
        });
    }

    protected modelId(): string | undefined {
        return this.options.modelId;
    }

    protected resolveProviderContextWindow(model: string): ResultAsync<number, EngineActError> {
        if (isLMStudioEngine(this.id, this.options)) {
            return new ResultAsync(getLMStudioModelMetadata(
                this.options.serverUrl,
                model,
                { apiKey: this.options.apiKey },
            ).then(result => result.map(metadata => metadata.contextWindow)));
        }
        if (isOllamaEngine(this.id, this.options)) {
            return new ResultAsync(getOllamaModelMetadata(
                this.options.serverUrl,
                model,
                { apiKey: this.options.apiKey },
            ).then(result => result.map(metadata => metadata.contextWindow)));
        }
        return super.resolveProviderContextWindow(model);
    }

    generate(request: LLMRequest, signal?: AbortSignal): ResultAsync<LLMGeneration, EngineActError> {
        return new ResultAsync(this.client.generate(request, undefined, signal));
    }
}

export const zReasoningEffort = z.enum(["auto", "none", "low", "medium", "high"]);

export const zOpenAIPrefs = z.looseObject({
    name: z.string().nonempty(),
    ...zLLMOptions.shape,
    reasoningEffort: zReasoningEffort.fallback("auto"),
    /** Leave empty if your server doesn't need authentication. (e.g. local) */
    apiKey: z.string().default("").sensitive(),
    serverUrl: z.url().default("https://api.openai.com/v1").sensitive(),
    modelId: z.string().optional(),
});

export type OpenAIPrefs = z.infer<typeof zOpenAIPrefs>;
export type ReasoningEffort = OpenAIPrefs["reasoningEffort"];

type OpenAIPrefsSource = {
    readonly prefs: OpenAIPrefs;
    setReasoningEffort(effort: ReasoningEffort): void;
};

const OPENAI_COMPAT_NO_API_KEY = " ";
const HARMONY_TOKEN_TAIL = /<\|(start|end|message|channel|constrain|return|call)\|>.*$/;

function normalizeToolName(name: string): string {
    return name.replace(HARMONY_TOKEN_TAIL, "");
}

function responseError(value: unknown): Error | undefined {
    const error = (value as { error?: unknown } | null)?.error;
    if (!error) return;
    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === "string" ? new Error(message, { cause: error }) : parseError(error);
}

// At some point we migrated OpenRouter from its own (beta) SDK back to just using the OpenAI-compatible API
// It started to look a bit too similar after that... the refactoring itch was irresistible
export class OpenAIClient {
    private readonly client: OpenAI;
    private get options() {
        return this.prefsSource.prefs;
    }

    constructor(private readonly prefsSource: OpenAIPrefsSource) {
        this.client = new OpenAI({
            apiKey: this.options.apiKey || OPENAI_COMPAT_NO_API_KEY,
            dangerouslyAllowBrowser: true,
            baseURL: this.options.serverUrl,
            fetch: openAICompatFetch,
        });
    }

    get name() {
        return this.options.name;
    }

    async generate(
        request: LLMRequest,
        extraParams?: Record<string, any>,
        signal?: AbortSignal,
    ): Promise<Result<LLMGeneration, EngineActError>> {
        const model = this.options.modelId;
        if (!model) {
            return err(new ConfigError(`${this.name} is missing a model ID`));
        }

        const baseParams: ChatCompletionCreateParamsNonStreaming = {
            model,
            messages: request.messages,
            stream: false,
            max_tokens: request.maxTokens,
            ...(request.responseSchema ? {
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "gary_action",
                        schema: request.responseSchema as Record<string, unknown>,
                        strict: true,
                    },
                },
            } : {}),
            ...(request.tools ? {
                tools: request.tools,
                tool_choice: request.toolChoice,
                parallel_tool_calls: false,
            } : {}),
            ...extraParams,
        };
        // ooga booga me no have reactivity because can be instantiate at runtime, outside root effect
        // so me use pull model instead of push model. hoh
        // me just know seniorberry shake head and wag finger from inside cloud, but me the one that feel alive
        this.client.baseURL = this.options.serverUrl;
        this.client.apiKey = this.options.apiKey || OPENAI_COMPAT_NO_API_KEY;

        // after evaluating tools/responses api - it all sucks bad
        // ollama only just started to support it (but not `tool_choice` - so, still useless to us)
        // lmstudio has responses (allegedly stateful) but doesn't support `strict` in tool definitions (ouch)
        // it also doesn't seem to constrain generation with `text.format` at all?
        // so... `chat/completions` it is
        type WireReasoningEffort = Exclude<ReasoningEffort, "auto">;
        type RequestFailure = { error: unknown; message: string; apiMessage?: string; causeMessage?: string };
        const isReasoningEffortError = (failure: RequestFailure) => {
            const text = [failure.message, failure.apiMessage, failure.causeMessage]
                .filter(Boolean)
                .join(" ");
            return /reasoning[_ ]effort|reasoning is mandatory/i.test(text);
        };
        const reqId = uuid();
        const sendRequest = async (effort?: WireReasoningEffort) => {
            const params: ChatCompletionCreateParamsNonStreaming = {
                ...baseParams,
                ...(effort ? { reasoning_effort: effort } : {}),
            };
            EVENT_BUS.emit('app/engines/llm/request', { reqId, params });
            const res = await ResultAsync.fromPromise(
                this.client.chat.completions.create(params, { signal }),
                (error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    const apiMessage = (error as any)?.error?.message;
                    const causeMessage = (error as any)?.cause?.message;
                    return {
                        error,
                        message,
                        apiMessage,
                        causeMessage,
                    } satisfies RequestFailure;
                },
            );
            return res;
        };

        const preference = this.options.reasoningEffort ?? "auto";
        let res: Awaited<ReturnType<typeof sendRequest>>;
        switch (preference) {
            case "auto":
                res = await sendRequest("none");
                break;
            default:
                res = await sendRequest(preference);
        }
        if (preference === "auto" && res.isErr() && isReasoningEffortError(res.error)) {
            this.prefsSource.setReasoningEffort("low");
            EVENT_BUS.emit('app/engines/llm/reasoning_effort_fallback', { reqId });
            res = await sendRequest("low");
        }
        if (signal?.aborted) {
            return err("cancelled");
        }
        EVENT_BUS.emit('app/engines/llm/response', { reqId, response: res });
        if (res.isErr()) {
            EVENT_BUS.emit('app/engines/llm/network_error', { reqId });
            return err(new EngineError(`${this.name} request failed: ${res.error.message}`, res.error.error as Error, false));
        }
        const response = res.value;
        type RespOrError = typeof response | { choices?: never, error: any };
        const resp = (response as RespOrError).choices?.[0];
        if (!resp) {
            EVENT_BUS.emit('app/engines/llm/error_result', { reqId });
            return err(new EngineError(
                `${this.name} did not return successful result`,
                responseError(response) ?? parseError(response),
            ));
        }
        if ((resp.finish_reason as string) === "error") {
            EVENT_BUS.emit('app/engines/llm/error_result', { reqId });
            return err(new EngineError(
                `${this.name} generation failed`,
                responseError(resp) ?? parseError(resp),
            ));
        }
        if (resp.finish_reason !== "stop" && resp.finish_reason !== "length" && resp.finish_reason !== "tool_calls") {
            EVENT_BUS.emit('app/engines/llm/assert', { reqId, assertion: 'finish_reason' });
            return err(new EngineError(`${this.name} returned unexpected finish_reason '${resp.finish_reason}'`, undefined, false))
        }
        const toolCalls = (resp.message.tool_calls ?? [])
            .filter((call): call is ChatCompletionMessageFunctionToolCall => call.type === "function")
            .map(call => ({
                id: call.id,
                // Some gpt-oss servers leak a Harmony channel token into the parsed function name.
                name: normalizeToolName(call.function.name),
                arguments: call.function.arguments,
            }));
        return ok({
            text: resp.message.content ?? "",
            toolCalls,
            metadata: {
                reasoning: (resp.message as any)?.reasoning,
                usage: response.usage,
                response,
            },
        });
    }
}

export const EVENTS = [
    {
        key: 'app/engines/llm/context_trimmed',
        dataSchema: {} as {
            engineId: string;
            contextWindow: number;
            source: "override" | "provider";
            model: string;
            completionReserve: number;
            promptBudget: number;
            estimatedPromptTokensBefore: number;
            estimatedPromptTokens: number;
            removedHistoryUnits: number;
        },
        description: "Old LLM context compacted to preserve the live edge",
        level: LogLevel.Debug,
    },
    {
        key: 'app/engines/llm/network_error',
        dataSchema: {} as { reqId: string },
        description: "LLM request failed due to a network error",
        level: LogLevel.Error,
    },
    {
        key: 'app/engines/llm/error_result',
        dataSchema: {} as { reqId: string },
        description: "LLM request returned an error result",
        level: LogLevel.Error,
    },
    {
        key: 'app/engines/llm/assert',
        dataSchema: {} as { reqId: string, assertion: string },
        description: "LLM response failed an internal assertion",
        level: LogLevel.Error,
    },
    {
        key: 'app/engines/llm/reasoning_effort_fallback',
        dataSchema: {} as { reqId: string },
        level: LogLevel.Warning,
        description: "Reasoning effort 'auto' unsupported, defaulting to low",
    },
    {
        key: 'app/engines/llm/request',
        dataSchema: z.object({
            reqId: z.string(),
            params: z.any().sensitive(),
        }),
        description: "LLM request sent",
        level: LogLevel.Verbose,
    },
    {
        key: 'app/engines/llm/response',
        dataSchema: z.object({
            reqId: z.string(),
            response: z.any().sensitive(),
        }),
        description: "LLM response received",
        level: LogLevel.Verbose,
    },
] as const satisfies EventDef<'app/engines/llm'>[];
