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

<div class="field">
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
            {const Icon = $derived(peekingPassword ? EyeOff : Eye)}
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




    .field-input {
        @apply pr-9;
    }

    .input-wrapper {
        @apply relative w-full;
    }

    .peek-button {
        @apply absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md;
        @apply text-ink-3 transition-colors;
        &:hover { @apply text-ink-1; }
        &:focus-visible { @apply outline-none ring-2 ring-accent; }
        & > :global(svg) { @apply size-4; }
    }
</style>
