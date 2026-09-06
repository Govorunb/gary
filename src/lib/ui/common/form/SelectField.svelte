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
    <select
        id={inputId}
        {required}
        {disabled}
        bind:value
        class="field-input"
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





</style>
