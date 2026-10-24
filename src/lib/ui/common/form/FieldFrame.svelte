<script lang="ts">
    import type { Snippet } from "svelte";
    import type { ControlProps } from "./field";
    import FieldHelp from "./FieldHelp.svelte";

    type Props = Omit<ControlProps<unknown>, "value" | "disabled"> & { children: Snippet };
    let { field, id, help, tip, children }: Props = $props();
</script>

{#snippet label()}
    <label for={id} class="field-label">
        {field.label}
        {#if field.required}
            <span class="required">*</span>
        {/if}
    </label>
{/snippet}

<!-- Label, control, then help; in Settings the help is a tip beside the label. -->
<div class="field" class:stacked={tip}>
    {#if tip && help}
        <div class="field-heading">
            {@render label()}
            <FieldHelp {help} tip />
        </div>
    {:else if field.label}
        {@render label()}
    {/if}
    {@render children()}
    {#if help && !tip}<FieldHelp {help} />{/if}
</div>
