<script lang="ts">
    import { zOpenAIPrefs, type OpenAIPrefs } from '$lib/app/engines/llm/openai.svelte';
    import StringField from '../common/form/StringField.svelte';
    import BooleanField from '../common/form/BooleanField.svelte';
    import UrlField from '../common/form/UrlField.svelte';
    import type { ConfigProps } from './EngineConfig.svelte';

    let { config = $bindable(), onSave }: ConfigProps<string> = $props();

    let dirtyConfig: OpenAIPrefs = $state(structuredClone($state.snapshot(config)));
    let validationErrors: string[] = $state([]);
    let isValid: boolean = $derived(validationErrors.length === 0);

    function validateConfig() {
        const result = zOpenAIPrefs.safeParse(dirtyConfig);
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
    <div class="config-form">
        <StringField 
            bind:value={dirtyConfig.name} 
            label="Name" 
            required 
            description="Display name for this engine"
        />
        <StringField 
            bind:value={dirtyConfig.apiKey} 
            label="API Key" 
            password
            description="API key (leave empty if not required)"
        />
        <UrlField 
            bind:value={dirtyConfig.serverUrl} 
            label="Server URL" 
            placeholder="https://api.openai.com/v1"
            description="Base URL for the API"
        />
        <StringField 
            bind:value={dirtyConfig.modelId} 
            label="Model ID" 
            description="Model identifier (e.g., llama3.1-7b)"
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

    {#if !isValid}
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

    .save-button {
        @apply px-4 py-2 bg-primary-600 text-white rounded-md;
        @apply hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500;
        @apply disabled:opacity-50 disabled:cursor-not-allowed;
    }
</style>