/* OpenRouter - realistically any OpenAI-compatible API (that supports structured outputs) */

import type { Action, Act } from "$lib/api/v1/spec";
import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { LLMEngine, type CommonLLMOptions, type OpenAIContext } from ".";
import { type Message } from "$lib/app/context.svelte";
import { OpenAI } from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/index.mjs";
import * as log from "@tauri-apps/plugin-log";

export interface Options extends CommonLLMOptions {
    baseUrl?: string;
    apiKey?: string;
    modelId?: string;
    /** Preferred order of providers for the model. */
    providerSortList?: string[];
    /** Display token usage and costs inline in the actor message. Adds a bit of l*tency to the response. */
    displayUsage?: boolean;
}

export class OpenRouter extends LLMEngine<Options> {
    readonly name: string = "OpenRouter";
    static BASE_URL = "https://openrouter.ai/api/v1";

    constructor(options: Options) {
        super(options);
        // TODO: remove and override once options are in user prefs
        if (!options.baseUrl) {
            options.baseUrl = OpenRouter.BASE_URL;
        } else if (options.baseUrl !== OpenRouter.BASE_URL) {
            log.warn(`OpenRouter baseUrl ${options.baseUrl} is not the expected ${OpenRouter.BASE_URL}`);
        }
    }

    async generate(context: OpenAIContext, outputSchema?: JSONSchema): Promise<Message> {
        const clientOpts = {
            apiKey: this.options.apiKey,
            baseURL: this.options.baseUrl,
            dangerouslyAllowBrowser: true,
        };
        const openai = new OpenAI(clientOpts);
        let params: ChatCompletionCreateParamsNonStreaming = {
            messages: context,
            model: this.options.modelId as any, // OR accepts empty model
        };
        if (outputSchema) {
            params.response_format = {
                type: "json_schema",
                json_schema: {
                    // TODO: name/description (pass down?)
                    name: "action",
                    description: "",
                    schema: outputSchema as any,
                    strict: true,
                },
            };
        }
        const res = await openai.chat.completions.create(params);

        const msg: Message = {
            id: res.id,
            timestamp: new Date(), // TODO zod
            text: res.choices[0].message.content!, // TODO: error handling and all
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
            const response = await fetch(`https://api.openrouter.ai/api/v1/generation?id=${id}`, {
                headers: {
                    "Authorization": `Bearer ${this.options.apiKey}`,
                },
            });
            const data = await response.json();
            return data;
        } catch (e) {
            log.error(`Failed to fetch OpenRouter generation info: ${e}`);
            throw e;
        }
    }
}