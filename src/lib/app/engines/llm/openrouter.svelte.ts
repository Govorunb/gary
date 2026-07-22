import { ConfigError, LLMEngine, zLLMOptions, type LLMGeneration, type LLMRequest } from ".";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import z from "zod";
import { err, errAsync, ok, type Result, ResultAsync } from "neverthrow";
import { EngineError, type EngineActError } from "../index.svelte";
import { OpenAIClient, type OpenAIPrefs, zReasoningEffort } from "./openai.svelte";
import { parseError } from "$lib/app/utils";

export const ENGINE_ID = "openRouter";

export class OpenRouter extends LLMEngine<OpenRouterPrefs> {
    readonly name: string = "OpenRouter";
    private client: OpenAIClient;

    constructor(userPrefs: UserPrefs) {
        super(userPrefs, ENGINE_ID);
        const clientPrefs = $state<OpenAIPrefs>({
            name: this.name,
            ...this.options,
            modelId: this.options.model ?? "openrouter/auto",
            serverUrl: "https://openrouter.ai/api/v1/",
        });
        $effect(() => {
            Object.assign(clientPrefs, {
                name: this.name,
                ...this.options,
                modelId: this.options.model ?? "openrouter/auto",
                serverUrl: "https://openrouter.ai/api/v1/",
            });
        });
        this.client = new OpenAIClient({ prefs: clientPrefs });
        $effect(() => {
            if (clientPrefs.reasoningEffort !== this.options.reasoningEffort)
                this.options.reasoningEffort = clientPrefs.reasoningEffort;
        });
    }

    generate(request: LLMRequest, signal?: AbortSignal): ResultAsync<LLMGeneration, EngineActError> {
        if (!this.options.apiKey) {
            return errAsync(new ConfigError("OpenRouter API key is required"));
        }
        return new ResultAsync(this.client.generate(request, {
            // some providers require reasoning (dude why)
            // provider: { require_parameters: true },
        }, signal));
    }

    static async testApiKey(apiKey: string): Promise<Result<void, EngineError>> {
        if (!apiKey) {
            return err(new EngineError("API key is required", undefined, false));
        }

        const res = await ResultAsync.fromPromise(fetch("https://openrouter.ai/api/v1/key", {
            headers: { Authorization: `Bearer ${apiKey}` }
        }), parseError);
        if (!res.isOk()) {
            return err(new EngineError("Could not check API key", res.error, false));
        }
        if (!res.value.ok) {
            const text = await res.value.text();
            return err(new EngineError("Invalid API key", new Error(text)));
        }

        return ok();
    }
}

export const zOpenRouterPrefs = z.strictObject({
    ...zLLMOptions.shape,
    reasoningEffort: zReasoningEffort.default("auto"),
    apiKey: z.string().default("").sensitive(),
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
