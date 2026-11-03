<script lang="ts">
    import Switch from "../Switch.svelte";
    import type { ControlProps } from "./field";
    import FieldHelp from "./FieldHelp.svelte";

    let { field, id, value = $bindable(), help, disabled, tip }: ControlProps<boolean> = $props();
</script>

{#if tip}
    <div class="field">
        <div class="field-heading">
            <span {id} class="field-label">{field.label}</span>
            {#if help}<FieldHelp {help} tip />{/if}
            <Switch bind:checked={value} {disabled} aria-labelledby={id} />
        </div>
    </div>
{:else}
    <div class="field">
        <Switch bind:checked={value} {disabled}>
            <span class="field-label">{field.label}</span>
        </Switch>
        {#if help}<FieldHelp {help} />{/if}
    </div>
{/if}
