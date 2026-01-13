<script lang="ts">
    import { zOpenRouterPrefs, type OpenRouterPrefs, ENGINE_ID, OpenRouter } from '$lib/app/engines/llm/openrouter.svelte';
    import { StringField, BooleanField } from '$lib/ui/common/form';
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
            label="Allow Do Nothing"
            description="Let the model choose to skip acting"
        />
        <BooleanField
            bind:value={dirtyConfig.allowYapping}
            label="Allow Yapping"
            description="Let the model speak instead of acting"
        />
    {/snippet}
</EngineConfig>
