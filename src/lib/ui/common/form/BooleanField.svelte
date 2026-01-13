<script lang="ts">
    interface Props {
        value: boolean;
        label?: string;
        disabled?: boolean;
        description?: string;
    }

    let {
        value = $bindable(),
        label = "",
        disabled = false,
        description = ""
    }: Props = $props();
</script>

<div class="field-container">
    <label class="checkbox-label">
        <input
            type="checkbox"
            {disabled}
            bind:checked={value}
            class="checkbox-input"
        />
        <span class="checkbox-text">{label}</span>
    </label>
    {#if description}
        <div class="field-description">{description}</div>
    {/if}
</div>

<style lang="postcss">
    @reference "global.css";

    .field-container {
        @apply fcol-1;
    }

    .checkbox-label {
        @apply frow-2 items-center cursor-pointer;
    }

    .checkbox-input {
        @apply w-4 h-4 text-primary-600 border-neutral-300 rounded;
        @apply dark:border-neutral-600 dark:bg-neutral-800;
        @apply disabled:opacity-50 disabled:cursor-not-allowed;

        &:focus {
            @apply ring-2 ring-primary-500;
        }
    }

    .checkbox-text {
        @apply text-sm font-medium text-neutral-700 dark:text-neutral-300;
    }

    .field-description {
        @apply text-xs text-neutral-500 dark:text-neutral-400 ml-6;
    }
</style>
