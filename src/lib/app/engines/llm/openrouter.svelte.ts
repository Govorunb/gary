import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { ConfigError, LLMEngine, zLLMOptions, type OpenAIContext } from "./index.svelte";
import type { Message } from "$lib/app/context.svelte";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import z from "zod";
import { err, errAsync, ok, type Result, ResultAsync } from "neverthrow";
import { EngineError, type EngineActError, type EngineActResult } from "../index.svelte";
import type { Action } from "$lib/api/v1/spec";
import { OpenAIClient } from "./openai.svelte";

export const ENGINE_ID = "openRouter";

export class OpenRouter extends LLMEngine<OpenRouterPrefs> {
    readonly name: string = "OpenRouter";
    private client: OpenAIClient;

    constructor(userPrefs: UserPrefs) {
        super(userPrefs, ENGINE_ID);
        // have to do this dance for reactivity
        const inner = $derived({
            name: this.name,
            ...this.options,
            modelId: this.options.model ?? "openrouter/auto",
            serverUrl: "https://openrouter.ai/api/v1/",
        });
        // ignore the formatting, svelte is annoying about where the diagnostic suppression should be placed
        const outer = $state({
            // svelte-ignore state_referenced_locally
            prefs: inner
        });
        $effect(() => {
            outer.prefs = inner;
        });
        this.client = new OpenAIClient(outer, ENGINE_ID);
    }

    generateStructuredOutput(context: OpenAIContext, outputSchema?: JSONSchema, signal?: AbortSignal): ResultAsync<Message, EngineActError> {
        if (!this.options.apiKey) {
            return errAsync(new ConfigError("OpenRouter API key is required"));
        }
        return new ResultAsync(this.client.genJson(context, outputSchema, {
            // some providers require reasoning (dude why)
            // provider: { require_parameters: true },
        }, signal));
    }
    generateToolCall(_context: OpenAIContext, _actions: Action[]): ResultAsync<EngineActResult, EngineActError> {
        return errAsync(new EngineError("Tool calling not implemented", undefined, false));
    }

    static async testApiKey(apiKey: string): Promise<Result<void, EngineError>> {
        if (!apiKey) {
            return err(new EngineError("API key is required", undefined, false));
        }

        const res = await ResultAsync.fromPromise(fetch("https://openrouter.ai/api/v1/key", {
            headers: { Authorization: `Bearer ${apiKey}` }
        }), x => x as Error);
        if (!res.isOk()) {
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
