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
    import { formatZodError } from '$lib/app/utils';
    import { PressedKeys } from 'runed';

    type Props = ConfigProps<E> & {
        schema: ZodType<EngineConfig<E>>;
        configForm: Snippet<[EngineConfig<E>]>;
    }
    let { engineId, schema, close, configForm }: Props = $props();

    const userPrefs = getUserPrefs();

    let dirtyConfig: EngineConfig<E> = $state()!;
    let validationErrors: string[] = $state([]);
    let isValid: boolean = $derived(validationErrors.length === 0);
    let hasUnsavedChanges: boolean = $derived(
        JSON.stringify(dirtyConfig) !== JSON.stringify(userPrefs.engines[engineId])
    );

    function reset() {
        dirtyConfig = structuredClone($state.snapshot(userPrefs.engines[engineId]));
    }
    reset();

    function validateConfig() {
        const result = schema.safeParse(dirtyConfig);
        if (result.success) {
            validationErrors = [];
        } else {
            validationErrors = formatZodError(result.error);
        }
    }

    $effect(validateConfig);
    const keys = new PressedKeys();
    keys.onKeys(['Control', 'Enter'], handleSave);

    function handleSave() {
        if (!isValid) return;
        userPrefs.engines[engineId] = dirtyConfig;
        close();
    }
</script>

<div class="fcol-0 overflow-hidden">
    <div class="config-content">
        {@render configForm(dirtyConfig)}
    </div>

    {#if !isValid}
        <div class="validation-error">
            {validationErrors.join("\n")}
        </div>
    {/if}

    {#if hasUnsavedChanges}
        <div class="config-footer">
            <span class="note opacity-60">There are unsaved changes.</span>
            <div class="flex-1"></div>
            <button class="btn btn-base preset-tonal-surface" onclick={reset}>
                Reset
            </button>
            <button
                class="btn btn-base preset-filled-primary-500"
                onclick={handleSave}
                disabled={!isValid}
                title="Ctrl+Enter"
            >
                Save changes
            </button>
        </div>
    {/if}
</div>

<style lang="postcss">
    @reference "global.css";

    .config-content {
        @apply fcol-4 flex-1 p-4 overflow-y-auto;
    }

    .validation-error {
        @apply p-3 bg-red-50 border border-red-200 text-red-700 rounded-md;
        @apply dark:bg-red-900/20 dark:border-red-800 dark:text-red-300;
    }

    .config-footer {
        @apply frow-2 items-center justify-end p-4;
        @apply border-t border-neutral-200 dark:border-neutral-700;
    }
</style>
