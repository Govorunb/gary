/* OpenRouter - realistically any OpenAI-compatible API (that supports structured outputs) */

import type { Action, Act } from "$lib/api/v1/spec";
import { LLMEngine, type CommonLLMOptions } from ".";
import { OpenAI } from 'openai';

export interface Options extends CommonLLMOptions {
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
    generate(schema: object): Promise<string> {
        throw new Error("Method not implemented.");
    }
}