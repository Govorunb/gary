<script lang="ts">
    import { toStepPrecision, shortId, scrollNumInput } from '$lib/app/utils';
    import { type HTMLInputAttributes } from 'svelte/elements';

    interface Props extends Omit<HTMLInputAttributes, 'type' | 'value' | 'id'> {
        value?: number;
        label?: string;
        placeholder?: string;
        required?: boolean;
        description?: string;
        slider?: boolean;
    };

    let {
        value = $bindable(),
        label = "",
        description = "",
        slider = false,
        ...props
    }: Props = $props();

    let inputId = $state(`input-${shortId()}`);
    const step: number = $derived(Number(props.step));
</script>

<div class="field">
    {#if label}
        <label for={inputId} class="field-label">
            {label}
            {#if props.required}
                <span class="required">*</span>
            {/if}
        </label>
    {/if}
    {#snippet input()}
        <input
            {...props}
            id={inputId}
            type={slider ? "range" : "number"}
            bind:value
            class="field-input"
            class:field-slider={slider}
            {@attach scrollNumInput}
        />
    {/snippet}
    {#if slider}
        <div class="w-full frow-2 items-center">
            {@render input()}
            <span class="min-w-6">{toStepPrecision(value ?? 0, step)}</span>
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




    .field-slider {
        @apply px-0 py-0 bg-transparent ring-0 accent-accent;
        &:focus { @apply ring-0; }
        &:focus-visible { @apply ring-2; }
    }

</style>
