<script lang="ts">
    import { zOpenRouterPrefs, type OpenRouterPrefs, ENGINE_ID, OpenRouter } from '$lib/app/engines/llm/openrouter.svelte';
    import StringField from '../common/form/StringField.svelte';
    import BooleanField from '../common/form/BooleanField.svelte';
    import type { ConfigProps } from './EngineConfig.svelte';
    import { toast } from 'svelte-sonner';
    import { ExternalLinkIcon, Info } from '@lucide/svelte';
    import Tooltip from '../common/Tooltip.svelte';

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
        {#snippet apiKeyLabel()}
            <p>
                API Key
                <Tooltip interactive>
                    {#snippet trigger(attrs)}
                        <button {...attrs}>
                            <Info size="14" />
                        </button>
                    {/snippet}
                    <div class="flex flex-col gap-1 bg-surface-800 p-2 rounded-md">
                        <p class="note">
                            Visit 
                            <a href="https://openrouter.ai/settings/keys" target="_blank">
                                <span class="link">OpenRouter <ExternalLinkIcon style="display:inline-block;" size="14" /></span>
                            </a>
                            to generate an API key.
                        </p>
                    </div>
                </Tooltip>
            </p>
        {/snippet}
        <StringField 
            bind:value={dirtyConfig.apiKey} 
            label={apiKeyLabel} 
            password 
            description="Your OpenRouter API key"
        />
        <button 
            class="test-connection-button" 
            onclick={handleTestConnection}
            disabled={isTestingConnection || !dirtyConfig.apiKey}
        >
            {isTestingConnection ? "Testing..." : "Test Connection"}
        </button>
        {#snippet modelLabel()}
            <p>
                Model
                <Tooltip interactive>
                    {#snippet trigger(attrs)}
                        <button {...attrs}>
                            <Info size="14" />
                        </button>
                    {/snippet}
                    <div class="flex flex-col gap-1 bg-surface-800 p-2 rounded-md">
                        <p class="note">
                            Visit 
                            <a href="https://openrouter.ai/models" target="_blank">
                                <span class="link">OpenRouter <ExternalLinkIcon style="display:inline-block;" size="14" /></span>
                            </a>
                            to pick a model.
                        </p>
                        <p class="note">
                            <a href="https://openrouter.ai/docs/features/presets" target="_blank">
                                <span class="link">Presets <ExternalLinkIcon style="display:inline-block;" size="14" /></span>
                            </a>
                            and
                            <a href="https://openrouter.ai/docs/faq#what-are-model-variants" target="_blank">
                                <span class="link">variants <ExternalLinkIcon style="display:inline-block;" size="14" /></span>
                            </a>
                            are supported.
                        </p>
                    </div>
                </Tooltip>
            </p>
        {/snippet}
        <StringField 
            bind:value={dirtyConfig.model} 
            label={modelLabel} 
            placeholder="openrouter/auto"
            description="Model identifier (slug)"
        />
        <p class="note">To configure preferred providers or fallback models, create a
            <a href="https://openrouter.ai/docs/features/presets" target="_blank">
                <span class="link">preset <ExternalLinkIcon style="display:inline-block;" size="14" /></span>
            </a>
            in your OpenRouter account.
        </p>
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
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";

    .engine-config {
        @apply flex flex-col gap-4;
    }

    .config-form {
        @apply flex flex-col gap-4;
    }

    .validation-error {
        @apply p-3 bg-red-50 border border-red-200 text-red-700 rounded-md
            dark:bg-red-900/20 dark:border-red-800 dark:text-red-300;
    }

    .config-actions {
        @apply flex justify-end pt-4 border-t border-neutral-200 dark:border-neutral-700;
    }

    .test-connection-button {
        @apply px-4 py-2 bg-secondary-600 text-white rounded-md
            hover:bg-secondary-700 focus:outline-none focus:ring-2 focus:ring-secondary-500
            disabled:opacity-50 disabled:cursor-not-allowed;
    }

    .save-button {
        @apply px-4 py-2 bg-primary-600 text-white rounded-md
            hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500
            disabled:opacity-50 disabled:cursor-not-allowed;
    }
    .note {
        @apply text-xs text-neutral-500 dark:text-neutral-300;
    }
    .link {
        @apply text-primary-600 hover:underline;
    }
</style>