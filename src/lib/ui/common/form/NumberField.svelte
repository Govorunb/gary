<script lang="ts">
    import { scrollNumInput, toStepPrecision } from "#lib/app/utils/index.js";
    import type { ControlProps } from "./field";
    import FieldFrame from "./FieldFrame.svelte";

    let { field, id, value = $bindable(), help, disabled, tip }: ControlProps<number> = $props();

    const slider = $derived(field.kind === "slider");
</script>

{#snippet input()}
    <!-- An emptied number input reads as null, which no schema accepts; empty means unset. -->
    <input
        {id}
        type={slider ? "range" : "number"}
        min={field.min} max={field.max} step={field.step}
        placeholder={field.placeholder || undefined}
        required={field.required}
        {disabled}
        bind:value={() => value, (v) => value = v ?? undefined}
        class="field-input"
        class:field-slider={slider}
        {@attach scrollNumInput}
    />
{/snippet}

<FieldFrame {field} {id} {help} {tip}>
    {#if slider}
        <div class="w-full frow-2 items-center">
            {@render input()}
            <span class="min-w-6">{toStepPrecision(value ?? 0, field.step ?? 1)}</span>
        </div>
    {:else}
        {@render input()}
    {/if}
</FieldFrame>

<style lang="postcss">
    @reference "global.css";

    .field-slider {
        @apply px-0 py-0 bg-transparent ring-0 accent-accent;
        &:focus { @apply ring-0; }
        &:focus-visible { @apply ring-2; }
    }
</style>
