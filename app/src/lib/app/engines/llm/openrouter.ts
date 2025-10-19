/* OpenRouter - realistically any OpenAI-compatible API (that supports structured outputs) */

import type { Action, Act } from "$lib/api/v1/spec";
import { LLMEngine, type CommonLLMOptions } from ".";
import { OpenAI } from 'openai';

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
    async generate(schema: object): Promise<string> {
        const openai = new OpenAI({
            apiKey: this.options.apiKey,
            baseURL: this.options.baseUrl,
            dangerouslyAllowBrowser: true,
        });
        // convert context to OpenAI messages
        // await openai.chat.completions.create({...});
        // validate/convert response to Act
        throw new Error("Method not implemented.");
    }
}