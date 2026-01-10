<script lang="ts">
    import { dev } from '$app/environment';
    import { zOpenAIPrefs } from '$lib/app/engines/llm/openai.svelte';
    import { StringField, BooleanField, UrlField } from '$lib/ui/common/form';
    import OutLink from '$lib/ui/common/OutLink.svelte';
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
        {#if dirtyConfig.serverUrl.includes(":11434/v1") && (dev || navigator.platform.includes("Win32"))}
            <div class="callout warn">
                <p class="note">
                    Ollama on Windows requires a user workaround.
                    See <OutLink href="https://github.com/Govorunb/gary/issues/7">issue #7</OutLink>.
                    {#if dev}(shown on all OSes in dev mode){/if}
                </p>
            </div>
        {/if}
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

<style lang="postcss">
    @reference "global.css";

    .callout {
        @apply p-3 rounded-lg;
        &.warn {
            @apply bg-warning-50 dark:bg-warning-900/20;
            @apply border border-warning-200 dark:border-warning-800;
        }
    }
</style>
