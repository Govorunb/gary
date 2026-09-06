<script lang="ts">
    import Switch from "../Switch.svelte";

    interface Props {
        value: boolean;
        label?: string;
        disabled?: boolean;
        description?: string;
    }

    let {
        value = $bindable(),
        label = "",
        disabled = false,
        description = ""
    }: Props = $props();
</script>

<div class="field">
    <Switch bind:checked={value} {disabled}>
        <span class="field-label">{label}</span>
    </Switch>
    {#if description}
        <div class="field-description">{description}</div>
    {/if}
</div>
