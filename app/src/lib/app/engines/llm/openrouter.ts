/* OpenRouter - realistically any OpenAI-compatible API (that supports structured outputs) */

import type { Action, Act } from "$lib/api/v1/spec";
import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { LLMEngine, type CommonLLMOptions, type OpenAIContext } from ".";
import { type Message } from "$lib/app/context.svelte";
import { OpenAI } from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/index.mjs";

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

    constructor(options: Options) {
        super(options);
    }
    async generate(context: OpenAIContext, outputSchema?: JSONSchema): Promise<Message> {
        const openai = new OpenAI({
            apiKey: this.options.apiKey,
            baseURL: this.options.baseUrl,
            dangerouslyAllowBrowser: true, // ...we have to...
        });
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

        // validate/convert response to Act
        throw new Error("Method not implemented.");
    }
}