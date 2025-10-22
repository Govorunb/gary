import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { LLMEngine, type CommonLLMOptions, type OpenAIContext } from ".";
import { type Message } from "$lib/app/context.svelte";
import * as log from "@tauri-apps/plugin-log";
import { toast } from "svelte-sonner";
import { getOpenRouterClient } from "$lib/app/utils/di";
import type { ChatGenerationParams, ChatResponse } from "@openrouter/sdk/models";

export interface Options extends CommonLLMOptions {
    apiKey?: string; // TODO: [stronghold](https://github.com/tauri-apps/tauri-plugin-stronghold)
    modelId?: string;
    /** Preferred order of providers for the model. */
    providerSortList?: string[];
    /** Display token usage and costs inline in the actor message. Adds a bit of l*tency to the response. */
    displayUsage?: boolean;
}

type NonStreamingChatParams = ChatGenerationParams & { stream?: false | undefined };

export class OpenRouter extends LLMEngine<Options> {
    readonly name: string = "OpenRouter";

    constructor(options: Options) {
        super(options);
    }

    async generate(context: OpenAIContext, outputSchema?: JSONSchema): Promise<Message> {
        let params: NonStreamingChatParams = {
            messages: context,
            model: this.options.modelId ?? "",
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
        const res: ChatResponse = await getOpenRouterClient().chat.send(params satisfies NonStreamingChatParams);

        const msg: Message = {
            id: res.id,
            timestamp: new Date(), // TODO zod
            text: res.choices[0].message.content as string, // TODO: error handling and all
            source: {
                type: "actor",
                manual: false,
            },
            options: {
                silent: true,
            },
            customData: {
                [this.name]: { res },
            }
        }
        this.fetchGenerationInfo(msg.id).then(gen => {
            msg.customData![this.name].gen = gen;
        });
        return msg;
    }

    async fetchGenerationInfo(id: string) {
        try {
            const response = await getOpenRouterClient().generations.getGeneration({ id });
            return response.data;
        } catch (e) {
            log.error(`Failed to fetch OpenRouter generation info: ${e}`);
            toast.error(`Failed to fetch OpenRouter generation info`, {
                description: e instanceof Error ? e.message : (e as any).toString?.(),
            });
        }
    }
}