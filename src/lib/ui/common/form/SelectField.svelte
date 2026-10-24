<script lang="ts">
    import type { ControlProps } from "./field";
    import FieldFrame from "./FieldFrame.svelte";

    let { field, id, value = $bindable(), help, disabled, tip }: ControlProps<string> = $props();
</script>

<FieldFrame {field} {id} {help} {tip}>
    <select {id} required={field.required} {disabled} bind:value class="field-input">
        {#each field.options as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
        {/each}
    </select>
</FieldFrame>
