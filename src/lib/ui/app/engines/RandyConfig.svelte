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
            description="Probability (0-1) of skipping an action. Keep this above 0 or Randy might get stuck in a retry loop for some actions."
        />
        <NumberField
            bind:value={dirtyConfig.latencyMs}
            min={1} max={864000000}
            label="L*tency"
            description="Optional delay for Randy's responses (in milliseconds). If you set this too low and Randy gets stuck in a retry loop, your app will hang. You have been sufficiently informed and thus warned."
        />
    {/snippet}
</EngineConfig>
