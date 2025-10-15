<script lang="ts">
    import { Tooltip, Portal } from "@skeletonlabs/skeleton-svelte";
    import type { Snippet } from "svelte";
    import type { SvelteHTMLElements } from "svelte/elements";

    type Props = {
        trigger: Snippet<[SvelteHTMLElements['button']]>,
        children: Snippet,
    }
    let {
        trigger,
        children,
    }: Props = $props();
</script>

<Tooltip>
    <Tooltip.Trigger element={trigger} />
    <Portal>
        <Tooltip.Positioner>
            <Tooltip.Content element={children}>
                <Tooltip.Arrow style="--arrow-size: calc(var(--spacing) * 2)">
                    <Tooltip.ArrowTip />
                </Tooltip.Arrow>
            </Tooltip.Content>
        </Tooltip.Positioner>
    </Portal>
</Tooltip>
