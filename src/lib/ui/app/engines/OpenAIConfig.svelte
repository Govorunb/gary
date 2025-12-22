<script lang="ts">
    import { zOpenAIPrefs } from '$lib/app/engines/llm/openai.svelte';
    import { StringField, BooleanField, UrlField } from '$lib/ui/common/form';
    import EngineConfig from './EngineConfig.svelte';

    let { engineId, close } = $props();
    const schema = zOpenAIPrefs;
</script>

<EngineConfig {engineId} {schema} {close}>
    {#snippet configForm(dirtyConfig)}
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
    {/snippet}
</EngineConfig>
