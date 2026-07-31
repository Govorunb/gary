import { parseError } from "$lib/app/utils";
import { err, ok, type Result, ResultAsync } from "neverthrow";
import z from "zod";
import { ConfigError } from ".";
import { EngineError } from "../index.svelte";
import { zModelMetadata, type ModelMetadata } from "./model-metadata";
import { authHeaders, localApiEndpoint, openAICompatFetch } from "./openai-compat";

export function isLMStudioEngine(
    engineId: string,
    prefs: { name: string; serverUrl: string },
): boolean {
    if (engineId === "lmstudio" || /\b(?:lmstudio|lm\s+studio|lms)\b/i.test(prefs.name)) {
        return true;
    }
    try {
        return new URL(prefs.serverUrl).port === "1234";
    } catch {
        return false;
    }
}

const zLMStudioModelResponse = z.looseObject({
    models: z.array(z.looseObject({
        key: z.string(),
        variants: z.array(z.string()).optional(),
        loaded_instances: z.array(z.looseObject({
            id: z.string(),
            config: z.looseObject({
                context_length: z.number().int().positive(),
            }),
        })),
    })),
});

const metadataCache = new Map<string, ModelMetadata>();

export async function getLMStudioModelMetadata(
    serverUrl: string,
    modelId: string,
    {
        refresh = false,
        apiKey,
    }: { refresh?: boolean; apiKey?: string } = {},
): Promise<Result<ModelMetadata, EngineError>> {
    const endpointResult = localApiEndpoint(serverUrl, "/api/v1/models");
    if (endpointResult.isErr()) return err(endpointResult.error);
    const endpoint = endpointResult.value;

    const cacheKey = `${endpoint}\0${modelId}`;
    const cached = metadataCache.get(cacheKey);
    if (cached && !refresh) return ok(cached);

    const responseResult = await ResultAsync.fromPromise(
        openAICompatFetch(endpoint, { headers: authHeaders(apiKey) }),
        parseError,
    );
    if (responseResult.isErr()) {
        return err(new EngineError("Could not load LM Studio model metadata", responseResult.error));
    }
    if (!responseResult.value.ok) {
        return err(new EngineError(
            `Could not load LM Studio model metadata: ${await responseResult.value.text()}`,
        ));
    }
    const jsonResult = await ResultAsync.fromPromise(responseResult.value.json(), parseError);
    if (jsonResult.isErr()) {
        return err(new EngineError("LM Studio returned invalid model metadata", jsonResult.error));
    }
    const parsed = zLMStudioModelResponse.safeParse(jsonResult.value);
    if (!parsed.success) {
        return err(new EngineError("LM Studio returned invalid model metadata", parsed.error));
    }

    const model = parsed.data.models.find(candidate =>
        candidate.key === modelId
        || candidate.variants?.includes(modelId)
        || candidate.loaded_instances.some(instance => instance.id === modelId)
    );
    if (!model) {
        return err(new ConfigError(`LM Studio model '${modelId}' was not found`, ["modelId"]));
    }
    const exactInstances = model.loaded_instances.filter(instance => instance.id === modelId);
    const instances = exactInstances.length ? exactInstances : model.loaded_instances;
    if (!instances.length) {
        return err(new ConfigError(`LM Studio model '${modelId}' is not loaded`, ["modelId"]));
    }

    const metadata = zModelMetadata.decode({
        contextWindow: Math.min(...instances.map(instance => instance.config.context_length)),
    });
    metadataCache.set(cacheKey, metadata);
    return ok(metadata);
}
