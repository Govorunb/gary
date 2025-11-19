<script lang="ts">
    import { zOpenRouterPrefs, type OpenRouterPrefs, ENGINE_ID, OpenRouter } from '$lib/app/engines/llm/openrouter.svelte';
    import StringField from '../common/form/StringField.svelte';
    import BooleanField from '../common/form/BooleanField.svelte';
    import type { ConfigProps } from './EngineConfig.svelte';
    import { toast } from 'svelte-sonner';
    import OutLink from '../common/OutLink.svelte';

    let { config = $bindable(), onSave }: ConfigProps<typeof ENGINE_ID> = $props();

    let dirtyConfig: OpenRouterPrefs = $state(structuredClone($state.snapshot(config)));
    let validationErrors: string[] = $state([]);
    let isValid: boolean = $derived(validationErrors.length === 0);
    let isTestingConnection: boolean = $state(false);

    function validateConfig() {
        const result = zOpenRouterPrefs.safeParse(dirtyConfig);
        if (result.success) {
            validationErrors = [];
        } else {
            validationErrors = result.error.issues.map(issue => issue.message);
        }
    }

    function handleSave() {
        if (!isValid) return;
        onSave(dirtyConfig);
    }

    async function handleTestConnection() {
        if (!dirtyConfig.apiKey) {
            toast.error("API key is required to test connection");
            return;
        }

        isTestingConnection = true;
        
        try {
            const result = await OpenRouter.testApiKey(dirtyConfig.apiKey);
            
            if (result.isOk()) {
                toast.success("Connection successful! API key is valid.");
            } else {
                toast.error("Connection failed", { 
                    description: result.error.message || "Invalid API key or network error" 
                });
            }
        } catch (error) {
            toast.error("Connection failed", { 
                description: error instanceof Error ? error.message : "Unknown error" 
            });
        } finally {
            isTestingConnection = false;
        }
    }

    $effect(() => {
        validateConfig();
    });
</script>

<div class="engine-config">
    <div class="config-form">
        {#snippet apiKeyDesc()}
            <p class="note">
                Visit 
                <OutLink href="https://openrouter.ai/settings/keys">OpenRouter</OutLink>
                to create an API key.
            </p>
        {/snippet}
        <StringField 
            bind:value={dirtyConfig.apiKey} 
            label="API Key"
            password 
            description={apiKeyDesc}
        />
        {#if dirtyConfig.apiKey}
            <button 
                class="test-connection-button" 
                onclick={handleTestConnection}
                disabled={isTestingConnection}
            >
                {isTestingConnection ? "Testing..." : "Test Connection"}
            </button>
        {/if}
        {#snippet modelDesc()}
            <div class="flex flex-col gap-1">
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
            </div>
        {/snippet}
        <StringField 
            bind:value={dirtyConfig.model}
            label="Model"
            placeholder="openrouter/auto"
            description={modelDesc}
        />
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
    </div>

    {#if validationErrors.length > 0}
        <div class="validation-error">
            {validationErrors.join("\n")}
        </div>
    {/if}

    <div class="config-actions">
        <button 
            class="save-button" 
            onclick={handleSave}
            disabled={!isValid}
        >
            Save Configuration
        </button>
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    .engine-config {
        @apply flex flex-col gap-4;
    }

    .config-form {
        @apply flex flex-col gap-4;
    }

    .validation-error {
        @apply p-3 bg-red-50 border border-red-200 text-red-700 rounded-md;
        @apply dark:bg-red-900/20 dark:border-red-800 dark:text-red-300;
    }

    .config-actions {
        @apply flex justify-end pt-4 border-t border-neutral-200 dark:border-neutral-700;
    }

    .test-connection-button {
        @apply px-4 py-2 bg-secondary-600 text-white rounded-md;
        @apply hover:bg-secondary-700 focus:outline-none focus:ring-2 focus:ring-secondary-500;
        @apply disabled:opacity-50 disabled:cursor-not-allowed;
    }

    .save-button {
        @apply px-4 py-2 bg-primary-600 text-white rounded-md;
        @apply hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500;
        @apply disabled:opacity-50 disabled:cursor-not-allowed;
    }
</style>