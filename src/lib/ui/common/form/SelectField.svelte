<script lang="ts">
    import { shortId } from "$lib/app/utils";
    import type { Snippet } from "svelte";

    type Option = {
        value: string;
        label: string;
        disabled?: boolean;
    };

    interface Props {
        value?: string;
        label?: string | Snippet;
        options: Option[];
        placeholder?: string;
        required?: boolean;
        disabled?: boolean;
        description?: string | Snippet;
    }

    let {
        value = $bindable(),
        label = "",
        options,
        placeholder = "",
        required = false,
        disabled = false,
        description = "",
    }: Props = $props();

    let inputId = $state(`select-${shortId()}`);
</script>

<div class="field-container">
    {#if label}
        <label for={inputId} class="field-label">
            {#if typeof label === "string"}
                {label}
            {:else}
                {@render label()}
            {/if}
            {#if required}
                <span class="required">*</span>
            {/if}
        </label>
    {/if}
    <select
        id={inputId}
        {required}
        {disabled}
        bind:value
        class="field-select"
    >
        {#if placeholder}
            <option value="" disabled selected={value === ""}>{placeholder}</option>
        {/if}
        {#each options as opt (opt.value)}
            <option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
        {/each}
    </select>
    {#if description}
        {#if typeof description === "string"}
            <div class="field-description">{description}</div>
        {:else}
            {@render description()}
        {/if}
    {/if}
</div>

<style lang="postcss">
    @reference "global.css";

    .field-container {
        @apply fcol-1;
    }

    .field-label {
        @apply text-sm font-medium text-neutral-700 dark:text-neutral-300;
    }

    .required {
        @apply text-red-500;
    }

    .field-select {
        @apply px-3 py-2 border border-neutral-300 rounded-md;
        @apply dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100;
        @apply disabled:opacity-50 disabled:cursor-not-allowed;

        &:focus {
            @apply outline-none ring-2 ring-primary-500 border-transparent;
        }
    }

    .field-description {
        @apply text-xs text-neutral-500 dark:text-neutral-400;
    }
</style>
