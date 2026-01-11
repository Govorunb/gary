<script lang="ts">
    import { Switch } from "@skeletonlabs/skeleton-svelte";
    import type { SwitchRootProps } from "@skeletonlabs/skeleton-svelte";
    import type { Snippet } from "svelte";

    type Props = {
        checked?: boolean,
        flipLabel?: boolean,
        children?: Snippet,
    } & SwitchRootProps;

    let {
        checked = $bindable(),
        flipLabel = false,
        children,
        ...props
    }: Props = $props();
</script>

<Switch {checked} onCheckedChange={(d) => checked = d.checked} {...props}>
    {#if children && !flipLabel}
        <Switch.Label>
            {@render children()}
        </Switch.Label>
    {/if}
    <Switch.Control class="bg-surface-100-900 data-[state=checked]:bg-primary-500">
        <Switch.Thumb />
    </Switch.Control>
    {#if children && flipLabel}
        <Switch.Label>
            {@render children()}
        </Switch.Label>
    {/if}
    <Switch.HiddenInput />
</Switch>
