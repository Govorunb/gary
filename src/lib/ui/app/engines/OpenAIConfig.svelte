<script lang="ts">
    import { dev } from '$app/environment';
    import { zOpenAIPrefs } from '$lib/app/engines/llm/openai.svelte';
    import { StringField, BooleanField, UrlField } from '$lib/ui/common/form';
    import Hotkey from '$lib/ui/common/Hotkey.svelte';
    import OutLink from '$lib/ui/common/OutLink.svelte';
    import EngineConfig from './EngineConfig.svelte';

    let { engineId, close } = $props();
    const schema = zOpenAIPrefs;
</script>

<EngineConfig {engineId} {schema} {close}>
    {#snippet configForm(dirtyConfig)}
        {@const isOllama = engineId === 'ollama'
            || dirtyConfig.name.match(/\bollama\b/i)
            || dirtyConfig.serverUrl.match(":11434/")}
        {@const isWindows = dev || navigator.platform.includes("Win32")}
        <StringField
            bind:value={dirtyConfig.name}
            label="Name"
            required
            description="Display name for this engine"
        />
        {#if isOllama && isWindows}
            <div class="callout warn">
                <p class="note">
                    Ollama on Windows requires a user workaround.
                    See <OutLink href="https://github.com/Govorunb/gary/issues/7">issue #7</OutLink>.
                    {#if dev}(shown on any OS in dev mode){/if}
                </p>
            </div>
        {/if}
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
        {#if isOllama && dirtyConfig.serverUrl.match(/https?:\/\/[^/]+\/api/i)}
            <div class="callout">
                <p class="note whitespace-pre-line">
                    Gary does not support Ollama's <OutLink href="https://docs.ollama.com/api/introduction">custom API</OutLink> on <Hotkey>/api</Hotkey>.
                    Please use the <OutLink href="https://docs.ollama.com/api/openai-compatibility">OpenAI-compatible API</OutLink> on <Hotkey>/v1</Hotkey>.
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
            label="Allow to do nothing"
            description="Let the model choose to skip acting (if not forced)"
        />
        <BooleanField
            bind:value={dirtyConfig.allowYapping}
            label="Allow yapping"
            description="Let the model choose to speak instead of acting (unless forced)"
        />
    {/snippet}
 </EngineConfig>
