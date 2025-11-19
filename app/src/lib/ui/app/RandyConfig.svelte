<script lang="ts">
    import { zRandyPrefs, type RandyPrefs, ENGINE_ID } from '$lib/app/engines/randy.svelte';
    import NumberField from '../common/form/NumberField.svelte';
    import type { ConfigProps } from './EngineConfig.svelte';

    let { config = $bindable(), onSave }: ConfigProps<typeof ENGINE_ID> = $props();

    let dirtyConfig: RandyPrefs = $state(structuredClone($state.snapshot(config)));
    let validationErrors: string[] = $state([]);
    let isValid = $derived(validationErrors.length === 0);

    function validateConfig() {
        const result = zRandyPrefs.safeParse(dirtyConfig);
        if (result.success) {
            validationErrors = [];
        } else {
            validationErrors = result.error.issues.map(e => e.message);
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
        <NumberField
            bind:value={dirtyConfig.chanceDoNothing}
            label="Chance to Do Nothing"
            min={0} max={1} step={0.01}
            slider
            description="Probability (0-1) of skipping an action"
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