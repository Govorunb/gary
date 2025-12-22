import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { ConfigError, LLMEngine, zLLMOptions, type OpenAIContext } from "./index.svelte";
import { zActorSource, zMessage, type Message } from "$lib/app/context.svelte";
import r from "$lib/app/utils/reporting";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import z from "zod";
import { err, errAsync, ok, ResultAsync, type Result } from "neverthrow";
import { EngineError, type EngineAct } from "../index.svelte";
import type { Action } from "$lib/api/v1/spec";
import { OpenAI } from 'openai';
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/index.mjs";
import type { CompletionUsage } from "openai/resources/completions.mjs";

export const ENGINE_ID = "openRouter";

export class OpenRouter extends LLMEngine<OpenRouterPrefs> {
    readonly name: string = "OpenRouter";
    private client: OpenAI;

    constructor(userPrefs: UserPrefs) {
        super(userPrefs, ENGINE_ID);
        this.client = new OpenAI({
            apiKey: this.options.apiKey ?? "-",
            dangerouslyAllowBrowser: true,
            baseURL: "https://openrouter.ai/api/v1/",
        });
    }

    generateStructuredOutput(context: OpenAIContext, outputSchema?: JSONSchema): ResultAsync<Message, EngineError> {
        if (!this.options.apiKey) {
            return errAsync(new ConfigError("OpenRouter API key is required"));
        }
        return new ResultAsync(this.genJson(context, outputSchema));
    }
    generateToolCall(context: OpenAIContext, actions: Action[]): ResultAsync<EngineAct | null, EngineError> {
        return errAsync(new EngineError("Tool calling not implemented", undefined, false));
    }

    async genJson(context: OpenAIContext, outputSchema?: JSONSchema): Promise<Result<Message, EngineError>> {
        this.client.apiKey = this.options.apiKey;

        const params: ChatCompletionCreateParamsStreaming = {
            messages: context,
            model: this.options.model ?? "openrouter/auto",
            stream: true,
            stream_options: { include_usage: true },
            // @ts-expect-error
            reasoning: { effort: "none" }, // ignored by provider. whatever
            // debug: { echo_upstream_body: true },
            structured_outputs: true,
            // some providers require reasoning (dude why)
            // provider: { require_parameters: true },
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

        console.warn("Full request params:", params);
        const res = await ResultAsync.fromPromise(this.client.chat.completions.create(params), x => x as Error);
        console.log("Response:", res);
        if (!res.isOk()) {
            console.error(res.error);
            r.error("OpenRouter chat.completions.create failed", {
                toast: false,
                ctx: {err: res.error}
            });
            let respErr: Error = res.error;
            if ((res.error as any)?.metadata?.provider_name) {
                const rawVal = res.error as any as {
                    error: {
                        message: string;
                        code: number;
                        metadata: {
                            provider_name: string;
                        }
                    },
                    user_id: string;
                };
                let errMsg = `Provider ${rawVal?.error?.metadata?.provider_name} did not return a valid response. It's possible the provider doesn't support structured outputs.`;
                
                if (rawVal?.error?.code === 524) {
                    errMsg = `Provider ${rawVal.error.metadata?.provider_name} timed out. If possible, try choosing a different provider.`;
                }
                errMsg += `\nRaw response: ${JSON.stringify(rawVal)}`;
                respErr = new Error(errMsg, {cause: res.error});
            }
            return err(new EngineError("Failed to generate", respErr, false));
        }

        const stream = res.value;
        let textOutput = "";
        let reasoning = "";
        const rawResp = [];
        let id: string | null = null;
        let usage: CompletionUsage | null = null;
        for await (const chunk of stream) {
            id ??= chunk.id;
            r.verbose(`OpenRouter response chunk: ${JSON.stringify(chunk)}`);
            rawResp.push(chunk);

            const resp = chunk.choices[0];
            // first debug chunk
            if (!resp) continue;

            textOutput += resp.delta.content || "";
            reasoning += ((resp.delta as any).reasoning || "");
            if (resp.finish_reason) {
                // final chunk
                if (resp.finish_reason && resp.finish_reason !== "stop" && resp.finish_reason !== "length") {
                    return err(new EngineError(`Unexpected finish_reason ${resp.finish_reason}`, undefined, false))
                }
                if (chunk.usage) {
                    usage = chunk.usage;
                }
            }
        }

        if (!textOutput) {
            return err(new EngineError(`Empty response`));
        }

        const msg = zMessage.decode({
            text: textOutput,
            source: zActorSource.decode({manual: false}),
            silent: true,
            customData: {
                [this.id]: { id, rawResp, usage, reasoning, },
            },
        });
        return ok(msg);
    }

    static async testApiKey(apiKey: string): Promise<Result<void, EngineError>> {
        if (!apiKey) {
            return err(new EngineError("API key is required", undefined, false));
        }

        const res = await ResultAsync.fromPromise(fetch("https://openrouter.ai/api/v1/key", {
            headers: { Authorization: `Bearer ${apiKey}` }
        }), x => x as Error);
        if (!res.isOk()) {
            return err(new EngineError("Invalid API key", res.error, false));
        }

        return ok();
    }
}

export const zOpenRouterPrefs = z.strictObject({
    ...zLLMOptions.shape,
    apiKey: z.string().default(""),
    /** OpenRouter model identifier.
     * Can be:
     * - Empty or "openrouter/auto" for auto routing
     * - A model slug ("gpt-5")
     * - A preset slug ("@preset/my-precious")
     * - Variants (":nitro", ":free") are supported as normal
     * See [OpenRouter docs](https://openrouter.ai/docs/features/model-routing) for more info.
     * */
    model: z.string().optional(),
});

export type OpenRouterPrefs = z.infer<typeof zOpenRouterPrefs>;
