<script lang="ts">
    import { zRandyPrefs, ENGINE_ID } from '$lib/app/engines/randy.svelte';
    import { NumberField } from '$lib/ui/common/form';
    import type { ConfigProps } from './EngineConfig.svelte';
    import EngineConfig from './EngineConfig.svelte';

    let { engineId, close }: ConfigProps<typeof ENGINE_ID> = $props();
    const schema = zRandyPrefs;
</script>

<EngineConfig {engineId} {schema} {close}>
    {#snippet configForm(dirtyConfig)}
        <NumberField
            bind:value={dirtyConfig.chanceDoNothing}
            label="Chance to Do Nothing"
            min={0} max={1} step={0.01}
            slider
            description="Probability (0-1) of skipping an action"
        />
    {/snippet}
</EngineConfig>
