import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { ConfigError, LLMEngine, zLLMOptions, type OpenAIContext } from ".";
import { zActorSource, zMessage, type Message } from "$lib/app/context.svelte";
import r from "$lib/app/utils/reporting";
import type { ChatGenerationParams, ChatGenerationTokenUsage } from "@openrouter/sdk/models";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import type { SDKOptions } from "@openrouter/sdk";
import z from "zod";
import { err, errAsync, ok, ResultAsync, type Result } from "neverthrow";
import { EngineError, type EngineAct } from "../index.svelte";
import { chatSend } from "@openrouter/sdk/funcs/chatSend";
import { generationsGetGeneration } from "@openrouter/sdk/funcs/generationsGetGeneration";
import { apiKeysGetCurrentKeyMetadata } from "@openrouter/sdk/funcs/apiKeysGetCurrentKeyMetadata";
import { OpenRouterCore } from "@openrouter/sdk/core.js";
import { ResponseValidationError } from "@openrouter/sdk/models/errors";
import type { Action } from "$lib/api/v1/spec";

export const ENGINE_ID = "openRouter";

export class OpenRouter extends LLMEngine<OpenRouterPrefs> {
    readonly name: string = "OpenRouter";
    private client: OpenRouterCore;

    constructor(userPrefs: UserPrefs) {
        super(userPrefs, ENGINE_ID);
        const clientOpts: SDKOptions = {
            apiKey: async () => this.options.apiKey,
        };
        this.client = new OpenRouterCore(clientOpts);
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
        type StreamingChatParams = ChatGenerationParams & { stream: true };

        const params: StreamingChatParams = {
            messages: context,
            model: this.options.model ?? "openrouter/auto",
            // reasoning: { effort: "none" },
            provider: { requireParameters: true },
            // @ts-expect-error
            transforms: ["middle-out"], // poor man's context trimming
            stream: true,
            streamOptions: { includeUsage: true }
        };
        if (outputSchema) {
            params.responseFormat = {
                type: "json_schema",
                jsonSchema: {
                    // FIXME: should ideally pass down from somewhere (figure out where)
                    name: "response",
                    description: "Response schema.",
                    schema: outputSchema,
                    strict: true,
                },
            };
            // @ts-expect-error
            params.structuredOutputs = true;
        }

        console.warn("Full request params:", params);
        const res = await chatSend(this.client, params satisfies StreamingChatParams);
        console.log("Response:", res);
        if (!res.ok) {
            console.error(res.error);
            r.error("OpenRouter chatSend failed", {
                toast: false,
                ctx: {err: res.error}
            })
            let respErr: Error = res.error;
            if (res.error instanceof ResponseValidationError) {
                const rawVal = res.error.rawValue as {
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
        const rawResp = [];
        let id: string | null = null;
        let usage: ChatGenerationTokenUsage | null = null;
        for await (const chunk of stream) {
            id ??= chunk.id;
            rawResp.push(JSON.stringify(chunk));
            const resp = chunk.choices[0];
            textOutput += resp.delta.content || "";
            if (resp.finishReason) {
                // final chunk
                if (resp.finishReason && resp.finishReason !== "stop" && resp.finishReason !== "length") {
                    return err(new EngineError(`Unexpected finishReason ${resp.finishReason}`, undefined, false))
                }
                if (chunk.usage) {
                    usage = chunk.usage;
                }
            }
        }

        r.verbose(`Raw OpenRouter response: ${rawResp.join("\n")}`);
        if (!textOutput) {
            return err(new EngineError(`Empty response`));
        }

        const msg = zMessage.decode({
            text: textOutput,
            source: zActorSource.decode({manual: false}),
            silent: true,
            customData: {
                [this.id]: { id, rawResp, usage },
            },
        })
        if (id) {
            // getting the generation fails ("doesn't exist") if you request it immediately on response
            // my brother in christ you gave me the id
            setTimeout(() => void generationsGetGeneration(this.client, { id }).then(res => {
                if (res.ok) {
                    msg.customData[this.id].gen = res.value;
                } else {
                    const errMsg = `Failed to fetch OpenRouter generation info for request ${id} (msg ${msg.id})`;
                    r.error(errMsg, {
                        ctx: {err: res.error}
                    });
                }
            }), 5000);
        }
        return ok(msg);
    }

    static async testApiKey(apiKey: string): Promise<Result<void, EngineError>> {
        if (!apiKey) {
            return err(new EngineError("API key is required", undefined, false));
        }

        const client = new OpenRouterCore({ apiKey: async () => apiKey });
        const res = await apiKeysGetCurrentKeyMetadata(client);
        if (!res.ok) {
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
