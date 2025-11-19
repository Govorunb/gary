<script lang="ts">
    import { toStepPrecision, shortId } from '$lib/app/utils';

    interface Props {
        value: number;
        label?: string;
        placeholder?: string;
        required?: boolean;
        disabled?: boolean;
        min?: number;
        max?: number;
        step?: number;
        description?: string;
        slider?: boolean;
    }

    let { 
        value = $bindable(), 
        label = "", 
        placeholder = "", 
        required = false, 
        disabled = false,
        min,
        max,
        step = 1,
        description = "",
        slider = false
    }: Props = $props();

    let inputId = $state(`input-${shortId()}`);
</script>

<div class="field-container">
    {#if label}
        <label for={inputId} class="field-label">
            {label}
            {#if required}
                <span class="required">*</span>
            {/if}
        </label>
    {/if}
    {#snippet input()}
        <input
            id={inputId}
            type={slider ? "range" : "number"}
            {placeholder}
            {required} {disabled}
            {min} {max} {step}
            bind:value
            class="field-input"
            class:field-slider={slider}
        />
    {/snippet}
    {#if slider}
        <div class="w-full flex items-center gap-2">
            {@render input()}
            <span class="min-w-6">{toStepPrecision(value, step)}</span>
        </div>
    {:else}
        {@render input()}
    {/if}
    {#if description}
        <div class="field-description">{description}</div>
    {/if}
</div>

<style lang="postcss">
    @reference "global.css";

    .field-container {
        @apply flex flex-col gap-1;
    }

    .field-label {
        @apply text-sm font-medium text-neutral-700 dark:text-neutral-300;
    }

    .required {
        @apply text-red-500;
    }

    .field-input {
        @apply px-3 py-2 border border-neutral-300 rounded-md;
        @apply dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100;
        @apply disabled:opacity-50 disabled:cursor-not-allowed;
        
        &:focus {
            @apply outline-none ring-2 ring-primary-500 border-transparent;
        }
    }

    .field-slider {
        @apply px-1 py-0 border-0 rounded-md w-full;
        @apply dark:bg-neutral-800 dark:text-neutral-100;
        @apply disabled:opacity-50 disabled:cursor-not-allowed;
        
        &:focus {
            @apply outline-none ring-2 ring-primary-500 border-transparent;
        }
    }

    .field-description {
        @apply text-xs text-neutral-500 dark:text-neutral-400;
    }
</style>