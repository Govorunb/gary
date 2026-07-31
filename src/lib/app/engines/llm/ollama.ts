import { parseError } from "$lib/app/utils";
import { err, ok, type Result, ResultAsync } from "neverthrow";
import z from "zod";
import { ConfigError } from ".";
import { EngineError } from "../index.svelte";
import { zModelMetadata, type ModelMetadata } from "./model-metadata";
import { authHeaders, localApiEndpoint, openAICompatFetch } from "./openai-compat";

export function isOllamaEngine(
    engineId: string,
    prefs: { name: string; serverUrl: string },
): boolean {
    if (engineId === "ollama" || /\bollama\b/i.test(prefs.name)) return true;
    try {
        return new URL(prefs.serverUrl).port === "11434";
    } catch {
        return false;
    }
}

const zOllamaProcessesResponse = z.looseObject({
    models: z.array(z.looseObject({
        name: z.string(),
        model: z.string(),
        context_length: z.number().int().positive(),
    })),
});

const metadataCache = new Map<string, ModelMetadata>();

function modelNameMatches(candidate: string, requested: string): boolean {
    return candidate === requested
        || (!requested.includes(":") && candidate === `${requested}:latest`);
}

export async function getOllamaModelMetadata(
    serverUrl: string,
    modelId: string,
    {
        refresh = false,
        apiKey,
    }: { refresh?: boolean; apiKey?: string } = {},
): Promise<Result<ModelMetadata, EngineError>> {
    const processesEndpoint = localApiEndpoint(serverUrl, "/api/ps");
    if (processesEndpoint.isErr()) return err(processesEndpoint.error);
    const generateEndpoint = localApiEndpoint(serverUrl, "/api/generate");
    if (generateEndpoint.isErr()) return err(generateEndpoint.error);

    const cacheKey = `${processesEndpoint.value}\0${modelId}`;
    const cached = metadataCache.get(cacheKey);
    if (cached && !refresh) return ok(cached);

    const headers = authHeaders(apiKey);
    const runningModels = async (): Promise<Result<z.infer<typeof zOllamaProcessesResponse>, EngineError>> => {
        const responseResult = await ResultAsync.fromPromise(
            openAICompatFetch(processesEndpoint.value, { headers }),
            parseError,
        );
        if (responseResult.isErr()) {
            return err(new EngineError("Could not load Ollama model metadata", responseResult.error));
        }
        if (!responseResult.value.ok) {
            return err(new EngineError(
                `Could not load Ollama model metadata: ${await responseResult.value.text()}`,
            ));
        }
        const jsonResult = await ResultAsync.fromPromise(responseResult.value.json(), parseError);
        if (jsonResult.isErr()) {
            return err(new EngineError("Ollama returned invalid model metadata", jsonResult.error));
        }
        const parsed = zOllamaProcessesResponse.safeParse(jsonResult.value);
        return parsed.success
            ? ok(parsed.data)
            : err(new EngineError("Ollama returned invalid model metadata", parsed.error));
    };

    let processes = await runningModels();
    if (processes.isErr()) return err(processes.error);
    let matches = processes.value.models.filter(model =>
        modelNameMatches(model.name, modelId)
        || modelNameMatches(model.model, modelId)
    );
    if (!matches.length) {
        const preloadHeaders = new Headers(headers);
        preloadHeaders.set("Content-Type", "application/json");
        const preloadResult = await ResultAsync.fromPromise(openAICompatFetch(generateEndpoint.value, {
            method: "POST",
            headers: preloadHeaders,
            body: JSON.stringify({ model: modelId, keep_alive: "5m", stream: false }),
        }), parseError);
        if (preloadResult.isErr()) {
            return err(new EngineError(`Could not load Ollama model '${modelId}'`, preloadResult.error));
        }
        if (!preloadResult.value.ok) {
            return err(new ConfigError(
                `Could not load Ollama model '${modelId}': ${await preloadResult.value.text()}`,
                ["modelId"],
            ));
        }
        processes = await runningModels();
        if (processes.isErr()) return err(processes.error);
        matches = processes.value.models.filter(model =>
            modelNameMatches(model.name, modelId)
            || modelNameMatches(model.model, modelId)
        );
    }
    if (!matches.length) {
        return err(new ConfigError(`Ollama model '${modelId}' is not running`, ["modelId"]));
    }

    const metadata = zModelMetadata.decode({
        contextWindow: Math.min(...matches.map(model => model.context_length)),
    });
    metadataCache.set(cacheKey, metadata);
    return ok(metadata);
}
