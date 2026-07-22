<script lang="ts">
    import { zOpenRouterPrefs, type OpenRouterPrefs, ENGINE_ID, OpenRouter } from '$lib/app/engines/llm/openrouter.svelte';
    import { StringField, BooleanField, SelectField } from '$lib/ui/common/form';
    import type { ConfigProps } from './EngineConfig.svelte';
    import { toast } from 'svelte-sonner';
    import OutLink from '$lib/ui/common/OutLink.svelte';
    import EngineConfig from './EngineConfig.svelte';
    import { LoaderCircle } from '@lucide/svelte';

    let isTestingApiKey: boolean = $state(false);
    let { engineId, close }: ConfigProps<typeof ENGINE_ID> = $props();
    const schema = zOpenRouterPrefs;

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
        <StringField
            bind:value={dirtyConfig.apiKey}
            label="API Key"
            password
        >
            {#snippet description()}
                <p class="note">
                    Visit
                    <OutLink href="https://openrouter.ai/settings/keys">OpenRouter</OutLink>
                    to create an API key.
                </p>
            {/snippet}
        </StringField>
        {#if dirtyConfig.apiKey}
            <button
                class="btn btn-base preset-filled-secondary-100-900"
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
        <StringField
            bind:value={dirtyConfig.model}
            label="Model"
            placeholder="openrouter/auto"
        >
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
        </StringField>
        <BooleanField
            bind:value={dirtyConfig.allowDoNothing}
            label="Allow to do nothing"
            description="Let the model choose to skip acting (if not forced)"
        />
        <BooleanField
            bind:value={dirtyConfig.allowYapping}
            label="Allow yapping"
            description="Let the model choose to speak instead of acting (unless forced)"
        />
        <details class="advanced-details">
            <summary>Advanced</summary>
            <SelectField
                bind:value={dirtyConfig.promptingStrategy}
                label="Response method"
                options={[
                    { value: "json", label: "Structured output" },
                    { value: "tools", label: "Tool calling" },
                ]}
                description="Choose how the model returns actions. Structured output works with more providers."
            />
            <SelectField
                bind:value={dirtyConfig.reasoningEffort}
                label="Reasoning effort"
                options={[
                    { value: "auto", label: "Auto (recommended)" },
                    { value: "none", label: "None" },
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                ]}
            >
                {#snippet description()}
                    <p class="note">
                        Auto defaults to None for minimum l*tency (but falls back to Low if the provider requires reasoning).
                    </p>
                {/snippet}
            </SelectField>
        </details>
    {/snippet}
</EngineConfig>

<style lang="postcss">
    @reference "global.css";

    .advanced-details {
        @apply mt-1 border border-neutral-200 dark:border-neutral-700 rounded-md;
        padding: 0.5rem;
        &[open] summary {
            @apply pb-2;
        }
        & summary {
            @apply frow-1.5 items-center cursor-pointer select-none;
            @apply text-sm font-semibold;
            @apply transition-[filter];
            &:hover {
                @apply brightness-125 dark:brightness-75;
            }
        }
    }
</style>
