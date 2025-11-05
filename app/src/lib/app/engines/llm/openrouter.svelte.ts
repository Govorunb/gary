import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { LLMEngine, zLLMOptions, type OpenAIContext } from ".";
import { zActorSource, zMessage, type Message } from "$lib/app/context.svelte";
import * as log from "@tauri-apps/plugin-log";
import { toast } from "svelte-sonner";
import type { ChatGenerationParams } from "@openrouter/sdk/models";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import { type SDKOptions } from "@openrouter/sdk";
import z from "zod";
import { err, ok, ResultAsync, type Result } from "neverthrow";
import { EngineError } from "../index.svelte";
import { chatSend } from "@openrouter/sdk/funcs/chatSend";
import { generationsGetGeneration } from "@openrouter/sdk/funcs/generationsGetGeneration";
import { OpenRouterCore } from "@openrouter/sdk/core.js";

export const ENGINE_ID = "openRouter";

export class OpenRouter extends LLMEngine<OpenRouterPrefs> {
    readonly name: string = "OpenRouter";
    private client: OpenRouterCore;

    constructor(userPrefs: UserPrefs) {
        super(userPrefs, ENGINE_ID);
        let clientOpts: SDKOptions = {
            apiKey: async () => this.options.apiKey,
        };
        this.client = new OpenRouterCore(clientOpts);
    }

    generate(context: OpenAIContext, outputSchema?: JSONSchema): ResultAsync<Message, EngineError> {
        return new ResultAsync(this.generateCore(context, outputSchema));
    }

    async generateCore(context: OpenAIContext, outputSchema?: JSONSchema): Promise<Result<Message, EngineError>> {
        type NonStreamingChatParams = ChatGenerationParams & { stream?: false | undefined };

        let params: NonStreamingChatParams = {
            messages: context,
            model: this.options.model ?? "openrouter/auto",
            models: this.options.extraModels,
            // TODO: sdk in beta, watch the package, they'll copy these over from the responses api some day maybe
            // @ts-expect-error
            provider: {
                order: this.options.providerSortList,
                requireParameters: true,
            },
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

        log.trace(`Raw OpenRouter response: ${JSON.stringify(res.value)}`);
        const resp = res.value.choices[0];
        if (resp.finishReason != "stop" && resp.finishReason != "length") {
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
            .then(r => {
                if (r.ok) {
                    msg.customData[this.id].gen = r.value;
                } else {
                    const errMsg = `Failed to fetch OpenRouter generation info for request ${msg.id}`;
                    log.error(`${errMsg}: ${r.error}`);
                    toast.error(errMsg, { description: `${r.error}` });
                }
            });
        return ok(msg);
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
     * - Suffixes (":nitro", ":free") are supported as normal
     * See [OpenRouter docs](https://openrouter.ai/docs/features/model-routing) for more info.
     * */
    model: z.string().optional(),
    /** Preferred order of providers for the model. Leave empty to let OpenRouter decide. */
    providerSortList: z.array(z.string()).optional(),
    /** A list of additional models to try if the first one fails. */
    extraModels: z.array(z.string()).optional(),
});

export type OpenRouterPrefs = z.infer<typeof zOpenRouterPrefs>;
