<script lang="ts">
    import { zOpenRouterPrefs, type OpenRouterPrefs, ENGINE_ID } from '$lib/app/engines/llm/openrouter.svelte';
    import StringField from '../common/form/StringField.svelte';
    import BooleanField from '../common/form/BooleanField.svelte';
    import type { ConfigProps } from './EngineConfig.svelte';

    let { config = $bindable(), onSave }: ConfigProps<typeof ENGINE_ID> = $props();

    let dirtyConfig: OpenRouterPrefs = $state(structuredClone($state.snapshot(config)));
    let validationErrors: string[] = $state([]);
    let isValid: boolean = $derived(validationErrors.length === 0);

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

    $effect(() => {
        validateConfig();
    });
</script>

<div class="engine-config">
    <div class="config-header">
        <h4>OpenRouter Configuration</h4>
    </div>

    <div class="config-form">
        <StringField 
            bind:value={dirtyConfig.apiKey} 
            label="API Key" 
            password 
            description="Your OpenRouter API key"
        />
        <StringField 
            bind:value={dirtyConfig.model} 
            label="Model" 
            placeholder="openrouter/auto"
            description="Model identifier or leave empty for auto routing"
        />
        <StringField 
            bind:value={
                () => dirtyConfig.providerSortList?.join(",") ?? "",
                (value) => dirtyConfig.providerSortList = value.split(",").map(s => s.trim())
            } 
            label="Provider Sort List" 
            placeholder="e.g. openai,anthropic"
            description="Preferred order of providers (comma-separated)"
        />
        <StringField 
            bind:value={
                () => dirtyConfig.extraModels?.join(",") ?? "",
                (value) => dirtyConfig.extraModels = value.split(",").map(s => s.trim())
            } 
            label="Extra Models" 
            placeholder="e.g. gpt-4,claude-3"
            description="Additional models to try if the first one fails (comma-separated)"
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
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";

    .engine-config {
        @apply flex flex-col gap-4;
    }

    .config-header {
        @apply border-b border-neutral-200 dark:border-neutral-700 pb-2;
    }

    .config-header h4 {
        @apply text-lg font-semibold text-neutral-900 dark:text-neutral-100;
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

    .save-button {
        @apply px-4 py-2 bg-primary-600 text-white rounded-md
            hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500
            disabled:opacity-50 disabled:cursor-not-allowed;
    }
</style>