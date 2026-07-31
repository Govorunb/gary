<script lang="ts">
    import type { EngineError } from '$lib/app/engines/index.svelte';
    import type {
        ModelMetadata,
        ModelMetadataOverrides,
    } from '$lib/app/engines/llm/model-metadata';
    import { NumberField } from '$lib/ui/common/form';
    import type { Result } from 'neverthrow';
    import { untrack } from 'svelte';

    interface Props {
        modelId?: string;
        overrides?: ModelMetadataOverrides;
        autoLoad?: boolean;
        loadMetadata?: (
            modelId: string,
            refresh?: boolean,
        ) => Promise<Result<ModelMetadata, EngineError>>;
    }

    let {
        modelId = '',
        overrides = $bindable(),
        autoLoad = false,
        loadMetadata,
    }: Props = $props();

    let providerMetadata: ModelMetadata | undefined = $state();
    let loadError: string | undefined = $state();
    let isLoading = $state(false);
    let open = $state(false);
    let requestVersion = 0;
    let lastAutomaticLookup: { model: string; enabled: boolean } | undefined;

    const model = $derived(modelId.trim());
    const override = $derived(model ? overrides?.[model] : undefined);
    const contextWindow = $derived(override?.contextWindow ?? providerMetadata?.contextWindow);

    $effect(() => {
        const requestedModel = model;
        const shouldAutoLoad = autoLoad;
        const loader = untrack(() => loadMetadata);
        if (
            lastAutomaticLookup?.model === requestedModel
            && lastAutomaticLookup.enabled === shouldAutoLoad
        ) return;
        lastAutomaticLookup = { model: requestedModel, enabled: shouldAutoLoad };

        const version = ++requestVersion;
        providerMetadata = undefined;
        loadError = undefined;
        isLoading = false;

        if (!requestedModel || !shouldAutoLoad || !loader) return;
        const timeout = window.setTimeout(
            () => void refresh(requestedModel, version, false, loader),
            650,
        );
        return () => window.clearTimeout(timeout);
    });

    async function refresh(
        requestedModel: string,
        version = ++requestVersion,
        bypassCache = false,
        loader = loadMetadata,
    ) {
        if (!requestedModel || !loader) return;
        isLoading = true;
        loadError = undefined;
        const result = await loader(requestedModel, bypassCache);
        if (version !== requestVersion || model !== requestedModel) return;

        if (result.isOk()) {
            providerMetadata = result.value;
        } else {
            providerMetadata = undefined;
            loadError = result.error.message;
            open = true;
        }
        isLoading = false;
    }

    function refreshCurrentModel() {
        if (!model) return;
        void refresh(model, ++requestVersion, true);
    }

    function setContextWindow(value: number | undefined) {
        if (!model) return;
        const next = { ...overrides };
        if (
            value === undefined
            || !Number.isFinite(value)
            || value === providerMetadata?.contextWindow
        ) {
            delete next[model];
        } else {
            next[model] = { contextWindow: value };
        }
        overrides = Object.keys(next).length ? next : undefined;
    }

    function useProviderValue() {
        setContextWindow(undefined);
    }
</script>

<details class="metadata-details" bind:open>
    <summary>
        <span>Model metadata</span>
        {#if override}
            <span class="source-badge">Override</span>
        {:else if providerMetadata}
            <span class="source-badge provider">Provider</span>
        {/if}
    </summary>

    <div class="metadata-content">
        {#if !model}
            <p class="note">Enter a model ID to configure its metadata.</p>
        {:else}
            <NumberField
                value={contextWindow}
                oninput={(event) => setContextWindow(event.currentTarget.valueAsNumber || undefined)}
                label="Context window"
                min="1"
                step="1"
                placeholder="Tokens"
                disabled={isLoading}
            />
            <p class="note">
                Maximum combined prompt and response size, in tokens. Editing this value overrides provider metadata for <code>{model}</code>.
            </p>

            {#if isLoading}
                <div class="metadata-skeleton" aria-label="Loading model metadata"></div>
            {:else if loadError}
                <p class="metadata-error" role="status">{loadError}</p>
            {/if}

            <div class="metadata-actions">
                {#if loadMetadata}
                    <button
                        type="button"
                        class="btn btn-base preset-tonal-surface"
                        onclick={refreshCurrentModel}
                        disabled={isLoading}
                    >
                        {providerMetadata ? 'Refresh metadata' : 'Load metadata'}
                    </button>
                {/if}
                {#if override && providerMetadata}
                    <button
                        type="button"
                        class="btn btn-base preset-tonal-surface"
                        onclick={useProviderValue}
                    >
                        Use provider value
                    </button>
                {/if}
            </div>
        {/if}
    </div>
</details>

<style lang="postcss">
    @reference "global.css";

    .metadata-details {
        @apply border border-neutral-200 dark:border-neutral-700 rounded-md;
    }

    summary {
        @apply frow-2 items-center cursor-pointer select-none;
        @apply px-3 py-2 text-sm font-medium;

        &:focus-visible {
            @apply outline-none ring-2 ring-inset ring-primary-500;
        }
    }

    .source-badge {
        @apply ml-auto px-2 py-0.5 rounded-full;
        @apply text-xs font-medium;
        @apply bg-secondary-100 text-secondary-800;
        @apply dark:bg-secondary-900/40 dark:text-secondary-200;

        &.provider {
            @apply bg-neutral-100 text-neutral-700;
            @apply dark:bg-neutral-800 dark:text-neutral-200;
        }
    }

    .metadata-content {
        @apply fcol-2 px-3 pb-3;
    }

    code {
        @apply text-neutral-700 dark:text-neutral-200;
    }

    .metadata-actions {
        @apply frow-2 flex-wrap;
    }

    .metadata-error {
        @apply text-xs text-red-700 dark:text-red-300;
    }

    .metadata-skeleton {
        @apply h-4 w-48 rounded;
        @apply bg-neutral-200 dark:bg-neutral-700 animate-pulse;
    }

    @media (prefers-reduced-motion: reduce) {
        .metadata-skeleton {
            animation: none;
        }
    }
</style>
