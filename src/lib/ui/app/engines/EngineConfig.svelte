<script lang="ts" module>
    import { type UserPrefsData } from '$lib/app/prefs.svelte';
    import { type ZodType } from 'zod';
    import OpenRouterConfig from './OpenRouterConfig.svelte';
    import OpenAIConfig from './OpenAIConfig.svelte';
    import RandyConfig from './RandyConfig.svelte';
    import { type Component } from 'svelte';
    
    export type Engines = UserPrefsData["engines"];
    export type EngineId = string;
    export type EngineConfig<E extends EngineId> = Engines[E];
    export interface ConfigProps<E extends EngineId> {
        engineId: E;
        close: () => void;
    };

    export function getEngineConfigComponent<E extends EngineId>(engineId: E): Component<ConfigProps<E>> {
        if (engineId === 'openRouter') return OpenRouterConfig as any;
        if (engineId === 'randy') return RandyConfig as any;
        return OpenAIConfig as any;
    }
</script>

<script lang="ts" generics="E extends EngineId">
    import { getUserPrefs } from '$lib/app/utils/di';
    import { type Snippet } from 'svelte';

    type Props = ConfigProps<E> & {
        schema: ZodType<EngineConfig<E>>;
        configForm: Snippet<[EngineConfig<E>]>;
    }
    let { engineId, schema, close, configForm }: Props = $props();

    const userPrefs = getUserPrefs();

    let dirtyConfig: EngineConfig<E> = $state()!;
    let validationErrors: string[] = $state([]);
    let isValid: boolean = $derived(validationErrors.length === 0);

    function reset() {
        dirtyConfig = structuredClone($state.snapshot(userPrefs.engines[engineId]));
    }
    reset();

    function validateConfig() {
        const result = schema.safeParse(dirtyConfig);
        if (result.success) {
            validationErrors = [];
        } else {
            validationErrors = result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
        }
    }
    
    $effect(() => {
        validateConfig();
    });

    function handleSave() {
        if (!isValid) return;
        userPrefs.engines[engineId] = dirtyConfig;
        close();
    }
</script>

<div class="engine-config-wrapper">
    <div class="engine-config">
        <div class="config-form">
            {@render configForm(dirtyConfig)}
        </div>

        {#if !isValid}
            <div class="validation-error">
                {validationErrors.join("\n")}
            </div>
        {/if}

        <div class="config-actions">
            <button class="reset-button" onclick={reset}>
                Reset
            </button>
            <button 
                class="save-button"
                onclick={handleSave}
                disabled={!isValid}
            >
                Save changes
            </button>
        </div>
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    .engine-config-wrapper {
        @apply w-full;
    }

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
        @apply flex flex-row gap-2 justify-end pt-4 border-t border-neutral-200 dark:border-neutral-700;
    }

    .save-button {
        @apply px-4 py-2 bg-primary-600 text-white rounded-md;
        @apply disabled:opacity-50 disabled:cursor-not-allowed;
        
        &:hover {
            @apply bg-primary-700;
        }
        
        &:focus {
            @apply outline-none ring-2 ring-primary-500;
        }
    }

    .reset-button {
        @apply px-4 py-2 bg-transparent text-neutral-600 dark:text-neutral-400 rounded-md;
        @apply disabled:opacity-50 disabled:cursor-not-allowed;

        &:hover {
            @apply bg-neutral-100 dark:bg-neutral-800;
            @apply text-neutral-900 dark:text-neutral-100;
        }
        
        &:focus {
            @apply outline-none ring-2 ring-neutral-500;
        }
    }
</style>