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

<div class="field">
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





</style>
