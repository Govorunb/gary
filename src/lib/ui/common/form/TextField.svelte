<script lang="ts">
    import { Eye, EyeOff } from "@lucide/svelte";
    import type { ControlProps } from "./field";
    import FieldFrame from "./FieldFrame.svelte";

    let { field, id, value = $bindable(), help, disabled, tip }: ControlProps<string> = $props();

    const hidden = $derived(field.kind === "password");
    let peeking = $state(false);
</script>

<FieldFrame {field} {id} {help} {tip}>
    <div class="input-wrapper">
        <input
            {id}
            type={hidden && !peeking ? "password" : "text"}
            autocomplete="off" aria-autocomplete="none"
            placeholder={field.placeholder}
            required={field.required}
            {disabled}
            bind:value
            class="field-input"
        />
        {#if hidden && (value || peeking)}
            {const Icon = $derived(peeking ? EyeOff : Eye)}
            <button
                type="button"
                class="peek-button"
                onclick={() => peeking = !peeking}
                aria-label={peeking ? "Hide" : "Show"}
                title={peeking ? "Hide" : "Show"}
            >
                <Icon />
            </button>
        {/if}
    </div>
</FieldFrame>

<style lang="postcss">
    @reference "global.css";

    .input-wrapper {
        @apply relative w-full;
        & > .field-input { @apply pr-9; }
    }

    .peek-button {
        @apply absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md;
        @apply text-ink-3 transition-colors;
        &:hover { @apply text-ink-1; }
        &:focus-visible { @apply outline-none ring-2 ring-accent; }
        & > :global(svg) { @apply size-4; }
    }
</style>
