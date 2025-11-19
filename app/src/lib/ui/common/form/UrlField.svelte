<script lang="ts">
    import { shortId } from "$lib/app/utils";

    interface Props {
        value: string;
        label?: string;
        placeholder?: string;
        required?: boolean;
        disabled?: boolean;
        description?: string;
    }

    let { 
        value = $bindable(), 
        label = "", 
        placeholder = "", 
        required = false, 
        disabled = false,
        description = ""
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
    <input
        id={inputId}
        type="url"
        {placeholder}
        {required}
        {disabled}
        bind:value
        class="field-input"
    />
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
        @apply px-3 py-2 border border-neutral-300 rounded-md
            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
            dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100
            disabled:opacity-50 disabled:cursor-not-allowed;
    }

    .field-description {
        @apply text-xs text-neutral-500 dark:text-neutral-400;
    }
</style>