<script lang="ts" module>
    import { type UserPrefsData } from '$lib/app/prefs.svelte';
    
    type Engines = UserPrefsData["engines"];
    type EngineId = string;
    type EngineConfig<E extends EngineId> = Engines[E];
    export interface ConfigProps<E extends EngineId> {
        config: EngineConfig<E>;
        onSave: (config: EngineConfig<E>) => void;
    };
</script>

<script lang="ts">
    import { getSession, getUserPrefs } from '$lib/app/utils/di';
    import OpenRouterConfig from './OpenRouterConfig.svelte';
    import OpenAIConfig from './OpenAIConfig.svelte';
    import RandyConfig from './RandyConfig.svelte';
    import type { Component } from 'svelte';

    interface Props {
        engineId: EngineId;
        onClose: () => void;
    }

    let { engineId, onClose }: Props = $props();

    const session = getSession();
    const userPrefs = getUserPrefs();
    const engine = $derived(session.engines[engineId]);

    // TODO: typing
    function getEngineConfig<E extends EngineId>(engineId: E): Component<ConfigProps<E>> {
        if (engineId === 'openRouter') return OpenRouterConfig as any;
        if (engineId === 'randy') return RandyConfig as any;
        return OpenAIConfig as any;
    }

    function handleSave<E extends EngineId>(config: Engines[E]) {
        // Update the actual config with proper type assertion
        userPrefs.engines[engineId] = config;
        
        // Update last used timestamp
        // TODO: Implement timestamp tracking
        
        // Close config
        onClose();
    }
</script>

{#if engine}
    {@const ConfigComponent = getEngineConfig(engineId)}
    <div class="engine-config-wrapper">
        <ConfigComponent config={userPrefs.engines[engineId]} onSave={handleSave} />
    </div>
{:else}
    <div class="engine-not-found">
        Engine not found: {engineId}
    </div>
{/if}

<style lang="postcss">
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";

    .engine-config-wrapper {
        @apply w-full;
    }

    .engine-not-found {
        @apply p-4 text-center text-neutral-500 dark:text-neutral-400;
    }
</style>