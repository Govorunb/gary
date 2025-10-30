import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { LLMEngine, zLLMOptions, type OpenAIContext } from ".";
import { zActorSource, zMessage, type Message } from "$lib/app/context.svelte";
import * as log from "@tauri-apps/plugin-log";
import { toast } from "svelte-sonner";
import type { ChatGenerationParams, ChatResponse } from "@openrouter/sdk/models";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import { OpenRouter as OpenRouterClient, type SDKOptions } from "@openrouter/sdk";
import z from "zod";

export const ENGINE_ID = "openRouter";

export class OpenRouter extends LLMEngine<OpenRouterPrefs> {
    readonly name: string = "OpenRouter";
    private client: OpenRouterClient;

    constructor(userPrefs: UserPrefs) {
        super(userPrefs, ENGINE_ID);
        let clientOpts: SDKOptions = {
            apiKey: async () => this.options.apiKey,
        };
        this.client = new OpenRouterClient(clientOpts);
    }

    async generate(context: OpenAIContext, outputSchema?: JSONSchema): Promise<Message> {
        type NonStreamingChatParams = ChatGenerationParams & { stream?: false | undefined };

        let params: NonStreamingChatParams = {
            messages: context,
            model: this.options.model ?? "openrouter/auto",
            // TODO: sdk in beta, watch the package, they'll copy these over from the responses api some day maybe
            // @ts-expect-error
            models: this.options.extraModels,
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
        const res: ChatResponse = await this.client.chat.send(params satisfies NonStreamingChatParams);

        const msg = zMessage.decode({
            text: res.choices[0].message.content as string, // TODO: error handling and all
            source: zActorSource.decode({manual: false}),
            silent: true,
            customData: {
                [ENGINE_ID]: { res },
            },
        })
        this.fetchGenerationInfo(msg.id).then(gen => {
            msg.customData![ENGINE_ID].gen = gen;
        });
        return msg;
    }

    async fetchGenerationInfo(id: string) {
        try {
            const response = await this.client.generations.getGeneration({ id });
            return response.data;
        } catch (e) {
            log.error(`Failed to fetch OpenRouter generation info: ${e}`);
            toast.error(`Failed to fetch OpenRouter generation info`, {
                description: e instanceof Error ? e.message : (e as any).toString?.(),
            });
        }
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
