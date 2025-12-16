import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { LLMEngine, zLLMOptions, type OpenAIContext } from ".";
import { zActorSource, zMessage, type Message } from "$lib/app/context.svelte";
import r from "$lib/app/utils/reporting";
import type { ChatGenerationParams } from "@openrouter/sdk/models";
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
        return new ResultAsync(this.genJson(context, outputSchema));
    }
    generateToolCall(context: OpenAIContext, actions: Action[]): ResultAsync<EngineAct | null, EngineError> {
        return errAsync(new EngineError("Tool calling not implemented", undefined, false));
    }

    async genJson(context: OpenAIContext, outputSchema?: JSONSchema): Promise<Result<Message, EngineError>> {
        type NonStreamingChatParams = ChatGenerationParams & { stream?: false | undefined };

        const params: NonStreamingChatParams = {
            messages: context,
            model: this.options.model ?? "openrouter/auto",
            reasoning: { effort: "none" },
            provider: {
                requireParameters: true
            },
            // @ts-expect-error
            transforms: ["middle-out"], // poor man's context trimming
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
        const res = await chatSend(this.client, params satisfies NonStreamingChatParams);
        console.log("Response:", res);
        if (!res.ok) {
            console.error(res.error);
            r.error("chatSend failed", {
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

        r.verbose(`Raw OpenRouter response: ${JSON.stringify(res.value)}`);
        const resp = res.value.choices[0];
        if (resp.finishReason !== "stop" && resp.finishReason !== "length") {
            return err(new EngineError(`Unexpected finishReason ${resp.finishReason}`, undefined, false))
        }

        const msg = zMessage.decode({
            text: res.value.choices[0].message.content as string,
            source: zActorSource.decode({manual: false}),
            silent: true,
            customData: {
                [this.id]: { res },
            },
        })
        // getting the generation fails ("doesn't exist") if you request it immediately on response
        // fuck me. my brother in christ you gave me the id
        setTimeout(() => {
            void generationsGetGeneration(this.client, { id: res.value.id })
                .then(res => {
                    if (res.ok) {
                        msg.customData[this.id].gen = res.value;
                    } else {
                        const errMsg = `Failed to fetch OpenRouter generation info for request ${msg.id}`;
                        r.error(errMsg, {
                            ctx: {err: res.error}
                        });
                    }
                });
        }, 5000);
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
