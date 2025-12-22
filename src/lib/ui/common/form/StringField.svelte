<script lang="ts">
    import { shortId } from "$lib/app/utils";
    import { Eye, EyeOff } from "@lucide/svelte";
    import type { Snippet } from "svelte";

    interface Props {
        value?: string;
        label?: string | Snippet;
        placeholder?: string;
        required?: boolean;
        disabled?: boolean;
        password?: boolean;
        description?: string | Snippet;
    }

    let { 
        value = $bindable(), 
        label = "", 
        placeholder = "", 
        required = false, 
        disabled = false, 
        password = false,
        description = ""
    }: Props = $props();

    let inputId = $state(`input-${shortId()}`);
    let peekingPassword = $state(false);
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
    <div class="input-wrapper">
        <input
            id={inputId}
            type={password && !peekingPassword ? "password" : "text"}
            autocomplete="off" aria-autocomplete="none"
            {placeholder}
            {required}
            {disabled}
            bind:value
            class="field-input"
        />
        {#if password && (value || peekingPassword)}
            {@const Icon = peekingPassword ? EyeOff : Eye}
            <button
                type="button"
                class="peek-button"
                onclick={() => peekingPassword = !peekingPassword}
                aria-label={peekingPassword ? "Hide" : "Show"}
                title={peekingPassword ? "Hide" : "Show"}
            >
                <Icon />
            </button>
        {/if}
    </div>
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
        @apply flex flex-col gap-1;
    }

    .field-label {
        @apply text-sm font-medium text-neutral-700 dark:text-neutral-300;
    }

    .required {
        @apply text-red-500;
    }

    .field-input {
        @apply px-3 py-2 pr-10 border border-neutral-300 rounded-md;
        @apply dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100;
        @apply disabled:opacity-50 disabled:cursor-not-allowed;
        
        &:focus {
            @apply outline-none ring-2 ring-primary-500 border-transparent;
        }
    }

    .field-description {
        @apply text-xs text-neutral-500 dark:text-neutral-400;
    }

    .input-wrapper {
        @apply relative w-full;
        & input {
            @apply w-full;
        }
    }

    .peek-button {
        @apply absolute right-2 top-1/2;
        @apply transform -translate-y-1/2 p-1 rounded-md;
        @apply text-neutral-500 dark:text-neutral-400;
        @apply bg-transparent border-none cursor-pointer;
        @apply focus:outline-2 outline-primary-500;
        @apply z-10;
        
        &:hover {
            @apply text-neutral-700;
            @apply dark:text-neutral-200;
        }
    }
</style>