<script lang="ts">
    import type { ControlProps } from "./field";
    import FieldFrame from "./FieldFrame.svelte";

    let { field, id, value = $bindable(), help, disabled, tip }: ControlProps<string> = $props();
</script>

<FieldFrame {field} {id} {help} {tip}>
    <input {id} type="url" placeholder={field.placeholder} required={field.required} {disabled} bind:value class="field-input" />
</FieldFrame>
