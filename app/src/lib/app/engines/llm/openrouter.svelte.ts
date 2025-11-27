import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { LLMEngine, zLLMOptions, type OpenAIContext } from ".";
import { zActorSource, zMessage, type Message } from "$lib/app/context.svelte";
import r from "$lib/app/utils/reporting";
import type { ChatGenerationParams } from "@openrouter/sdk/models";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import type { SDKOptions } from "@openrouter/sdk";
import z from "zod";
import { err, ok, ResultAsync, type Result } from "neverthrow";
import { EngineError } from "../index.svelte";
import { chatSend } from "@openrouter/sdk/funcs/chatSend";
import { generationsGetGeneration } from "@openrouter/sdk/funcs/generationsGetGeneration";
import { apiKeysGetCurrentKeyMetadata } from "@openrouter/sdk/funcs/apiKeysGetCurrentKeyMetadata";
import { OpenRouterCore } from "@openrouter/sdk/core.js";

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

    generate(context: OpenAIContext, outputSchema?: JSONSchema): ResultAsync<Message, EngineError> {
        return new ResultAsync(this.generateCore(context, outputSchema));
    }

    async generateCore(context: OpenAIContext, outputSchema?: JSONSchema): Promise<Result<Message, EngineError>> {
        type NonStreamingChatParams = ChatGenerationParams & { stream?: false | undefined };

        const params: NonStreamingChatParams = {
            messages: context,
            model: this.options.model ?? "openrouter/auto",
        };
        if (outputSchema) {
            params.responseFormat = {
                type: "json_schema",
                jsonSchema: {
                    // TODO: name/description (pass down?)
                    name: "",
                    description: "",
                    schema: outputSchema as any,
                    strict: true,
                },
            };
        }
        const res = await chatSend(this.client, params satisfies NonStreamingChatParams);
        if (!res.ok) {
            return err(new EngineError("Failed to generate", res.error, false));
        }

        r.trace(`Raw OpenRouter response: ${JSON.stringify(res.value)}`);
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
        void generationsGetGeneration(this.client, { id: res.value.id })
            .then(res => {
                if (res.ok) {
                    msg.customData[this.id].gen = res.value;
                } else {
                    const errMsg = `Failed to fetch OpenRouter generation info for request ${msg.id}`;
                    r.error(errMsg, String(res.error));
                }
            });
        return ok(msg);
    }

    async testConnection(): Promise<Result<void, EngineError>> {
        if (!this.options.apiKey) {
            return err(new EngineError("API key is required", undefined, false));
        }

        const res = await apiKeysGetCurrentKeyMetadata(this.client);
        if (!res.ok) {
            return err(new EngineError("Invalid API key", res.error, false));
        }

        return ok();
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
