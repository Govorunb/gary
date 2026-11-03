<script lang="ts">
    import { getLMStudioModelMetadata, isLMStudioEngine } from '#lib/app/engines/llm/lm-studio.js';
    import { getOllamaModelMetadata, isOllamaEngine } from '#lib/app/engines/llm/ollama.js';
    import { zOpenAIPrefs } from '#lib/app/engines/llm/openai.svelte.js';
    import Field from '#lib/ui/common/form/Field.svelte';
    import Hotkey from '#lib/ui/common/Hotkey.svelte';
    import OutLink from '#lib/ui/common/OutLink.svelte';
    import EngineConfig, { type ConfigProps } from './EngineConfig.svelte';
    import ModelMetadata from './ModelMetadata.svelte';

    let { engineId, close }: ConfigProps<string> = $props();
    const schema = zOpenAIPrefs;
    const fields = schema.shape;
</script>

<EngineConfig {engineId} {schema} {close}>
    {#snippet configForm(dirtyConfig)}
        {const isOllama = $derived(isOllamaEngine(engineId, dirtyConfig))}
        {const isLMStudio = $derived(isLMStudioEngine(engineId, dirtyConfig))}
        <Field schema={fields.name} bind:value={dirtyConfig.name} />
        {#if isLMStudio}
            <div class="callout warn">
                <p class="note">
                    LMStudio requires CORS enabled in its server settings.
                    See <OutLink href="https://github.com/Govorunb/gary/issues/10#issuecomment-3972596384">issue #10</OutLink>.
                </p>
            </div>
        {/if}
        <Field schema={fields.apiKey} bind:value={dirtyConfig.apiKey} />
        <Field schema={fields.serverUrl} bind:value={dirtyConfig.serverUrl} />
        {#if isOllama && dirtyConfig.serverUrl.match(/https?:\/\/[^/]+\/api/i)}
            <div class="callout">
                <p class="note whitespace-pre-line">
                    Gary does not support Ollama's <OutLink href="https://docs.ollama.com/api/introduction">custom API</OutLink> on <Hotkey>/api</Hotkey>.
                    Please use the <OutLink href="https://docs.ollama.com/api/openai-compatibility">OpenAI-compatible API</OutLink> on <Hotkey>/v1</Hotkey>.
                </p>
            </div>
        {/if}
        <div class="fcol-2">
            <Field schema={fields.modelId} bind:value={dirtyConfig.modelId} />
            <ModelMetadata
                modelId={dirtyConfig.modelId}
                bind:overrides={dirtyConfig.modelMetadata}
                autoLoad={isLMStudio || isOllama}
                sourceId={dirtyConfig.serverUrl}
                loadMetadata={isLMStudio
                    ? (modelId, refresh) => getLMStudioModelMetadata(
                        dirtyConfig.serverUrl,
                        modelId,
                        { refresh, apiKey: dirtyConfig.apiKey },
                    )
                    : isOllama
                    ? (modelId, refresh) => getOllamaModelMetadata(
                        dirtyConfig.serverUrl,
                        modelId,
                        { refresh, apiKey: dirtyConfig.apiKey },
                    )
                    : undefined}
            />
        </div>
        <Field schema={fields.allowDoNothing} bind:value={dirtyConfig.allowDoNothing} />
        <Field schema={fields.allowYapping} bind:value={dirtyConfig.allowYapping} />
        <details class="details-box advanced-details">
            <summary>Advanced</summary>
            <Field schema={fields.promptingStrategy} bind:value={dirtyConfig.promptingStrategy} />
            <Field schema={fields.reasoningEffort} bind:value={dirtyConfig.reasoningEffort} />
        </details>
    {/snippet}
 </EngineConfig>

<style lang="postcss">
    @reference "global.css";

    .advanced-details {
        @apply fcol-4 mt-1;
    }
</style>
