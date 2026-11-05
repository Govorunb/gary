<script lang="ts">
    import {
        zOpenRouterPrefs,
        type OpenRouterPrefs,
        type ENGINE_ID,
        getOpenRouterModelMetadata,
        OpenRouter,
    } from '#lib/app/engines/llm/openrouter.svelte.js';
    import Field from '#lib/ui/common/form/Field.svelte';
    import type { ConfigProps } from './EngineConfig.svelte';
    import { toast } from 'svelte-sonner';
    import OutLink from '#lib/ui/common/OutLink.svelte';
    import EngineConfig from './EngineConfig.svelte';
    import { LoaderCircle } from '@lucide/svelte';
    import ModelMetadata from './ModelMetadata.svelte';

    let isTestingApiKey: boolean = $state(false);
    let { engineId, close }: ConfigProps<typeof ENGINE_ID> = $props();
    const schema = zOpenRouterPrefs;
    const fields = schema.shape;

    async function testApiKey(dirtyConfig: OpenRouterPrefs) {
        if (!dirtyConfig.apiKey) {
            toast.error("API key is required to test connection");
            return;
        }
        if (isTestingApiKey) return ;

        isTestingApiKey = true;

        const result = await OpenRouter.testApiKey(dirtyConfig.apiKey);

        if (result.isOk()) {
            toast.success("Connection successful! API key is valid.");
        } else {
            toast.error(result.error.message, {
                description: (result.error.cause as Error).message
            });
        }
        isTestingApiKey = false;
    }
</script>

<EngineConfig {engineId} {schema} {close}>
    {#snippet configForm(dirtyConfig)}
        <Field schema={fields.apiKey} bind:value={dirtyConfig.apiKey}>
            {#snippet description()}
                <p class="note">
                    Visit
                    <OutLink href="https://openrouter.ai/settings/keys">OpenRouter</OutLink>
                    to create an API key.
                </p>
            {/snippet}
        </Field>
        {#if dirtyConfig.apiKey}
            <button
                class="btn self-start"
                onclick={() => testApiKey(dirtyConfig)}
                disabled={isTestingApiKey}
            >
                {#if isTestingApiKey}
                    <LoaderCircle class="animate-spin" />
                    <span>Testing...</span>
                {:else}
                    Test API key
                {/if}
            </button>
        {/if}
        <div class="fcol-2">
            <Field schema={fields.model} bind:value={dirtyConfig.model}>
                {#snippet description()}
                    <p class="note">
                        Visit
                        <OutLink href="https://openrouter.ai/models">OpenRouter</OutLink>
                        to pick a model.
                        <OutLink href="https://openrouter.ai/docs/features/presets">Presets</OutLink>
                        and
                        <OutLink href="https://openrouter.ai/docs/faq#what-are-model-variants">variants</OutLink>
                        are supported.
                        <br/>
                        To configure preferred providers or fallback models, create a preset in your OpenRouter account.
                    </p>
                {/snippet}
            </Field>
            <ModelMetadata
                modelId={dirtyConfig.model?.trim() || 'openrouter/auto'}
                bind:overrides={dirtyConfig.modelMetadata}
                autoLoad={Boolean(dirtyConfig.apiKey)}
                loadMetadata={dirtyConfig.apiKey
                    ? (modelId, refresh) => getOpenRouterModelMetadata(
                        dirtyConfig.apiKey,
                        modelId,
                        { refresh },
                    )
                    : undefined}
            />
        </div>
        <Field schema={fields.allowDoNothing} bind:value={dirtyConfig.allowDoNothing} />
        <Field schema={fields.allowYapping} bind:value={dirtyConfig.allowYapping} />
        <details class="details-box advanced-details">
            <summary>Advanced</summary>
            <Field schema={fields.allowUnregisteredActions} bind:value={dirtyConfig.allowUnregisteredActions} />
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
