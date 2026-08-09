import { ConfigError, LLMEngine, zLLMOptions, type LLMGeneration, type LLMRequest } from ".";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import z from "zod";
import { err, errAsync, ok, type Result, ResultAsync } from "neverthrow";
import { EngineError, type EngineActError } from "../index.svelte";
import { OpenAIClient, type OpenAIPrefs, zReasoningEffort } from "./openai.svelte";
import { parseError } from "$lib/app/utils";
import { zModelMetadata, type ModelMetadata } from "./model-metadata";

export const ENGINE_ID = "openRouter";

export class OpenRouter extends LLMEngine<OpenRouterPrefs> {
    readonly name: string = "OpenRouter";
    private client: OpenAIClient;

    constructor(userPrefs: UserPrefs) {
        super(userPrefs, ENGINE_ID);
        const self = this;
        this.client = new OpenAIClient({
            get prefs(): OpenAIPrefs {
                return {
                    name: self.name,
                    ...self.options,
                    modelId: self.modelId(),
                    serverUrl: "https://openrouter.ai/api/v1/",
                };
            },
            setReasoningEffort(effort) {
                self.options.reasoningEffort = effort;
            },
        });
    }

    protected modelId(): string {
        return this.options.model?.trim() || "openrouter/auto";
    }

    protected resolveProviderContextWindow(model: string): ResultAsync<number, EngineActError> {
        return new ResultAsync(getOpenRouterModelMetadata(this.options.apiKey, model)
            .then(result => result.map(metadata => metadata.contextWindow)));
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

const zOpenRouterModelResponse = z.looseObject({
    data: z.looseObject({
        context_length: z.number().int().positive(),
    }),
});

const modelMetadataCache = new Map<string, ModelMetadata>();

export async function getOpenRouterModelMetadata(
    apiKey: string,
    model: string,
    { refresh = false }: { refresh?: boolean } = {},
): Promise<Result<ModelMetadata, EngineError>> {
    if (!apiKey) return err(new ConfigError("OpenRouter API key is required"));
    if (model.startsWith("@preset/")) {
        return err(new ConfigError(
            "OpenRouter presets need a context window override",
            ["modelMetadata", model, "contextWindow"],
        ));
    }
    const slash = model.indexOf("/");
    if (slash <= 0 || slash === model.length - 1) {
        return err(new ConfigError(`Invalid OpenRouter model ID '${model}'`, ["model"]));
    }
    const cached = modelMetadataCache.get(model);
    if (cached && !refresh) return ok(cached);

    const author = encodeURIComponent(model.slice(0, slash));
    const slug = encodeURIComponent(model.slice(slash + 1));
    const responseResult = await ResultAsync.fromPromise(fetch(
        `https://openrouter.ai/api/v1/model/${author}/${slug}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
    ), parseError);
    if (responseResult.isErr()) {
        return err(new EngineError("Could not load OpenRouter model metadata", responseResult.error));
    }
    if (!responseResult.value.ok) {
        const message = await responseResult.value.text();
        return err(responseResult.value.status === 404
            ? new ConfigError(`OpenRouter model '${model}' was not found`, ["model"])
            : new EngineError(`Could not load OpenRouter model metadata: ${message}`));
    }
    const jsonResult = await ResultAsync.fromPromise(responseResult.value.json(), parseError);
    if (jsonResult.isErr()) {
        return err(new EngineError("OpenRouter returned invalid model metadata", jsonResult.error));
    }
    const parsed = zOpenRouterModelResponse.safeParse(jsonResult.value);
    if (!parsed.success) {
        return err(new EngineError("OpenRouter returned invalid model metadata", parsed.error));
    }
    const metadata = zModelMetadata.decode({ contextWindow: parsed.data.data.context_length });
    modelMetadataCache.set(model, metadata);
    return ok(metadata);
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
