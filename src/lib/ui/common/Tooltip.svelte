<script lang="ts">
    import { Tooltip, Portal } from "@skeletonlabs/skeleton-svelte";
    import type { Snippet } from "svelte";
    import type { SvelteHTMLElements } from "svelte/elements";
    import type { TooltipRootProps } from "@skeletonlabs/skeleton-svelte";

    type SnippetOfHTML<T extends keyof SvelteHTMLElements> = Snippet<[SvelteHTMLElements[T]]>;
    type Props = {
        trigger: SnippetOfHTML<'button'>,
        content?: SnippetOfHTML<'div'>,
        children?: Snippet,
    } & TooltipRootProps;

    let {
        trigger,
        content,
        children,
        ...props
    }: Props = $props();
</script>

<Tooltip {...props}>
    <Tooltip.Trigger element={trigger} />
    <Portal>
        <Tooltip.Positioner class="layer-tooltip">
            <Tooltip.Content element={content} class="layer-tooltip relative">
                {@render children?.()}
            </Tooltip.Content>
        </Tooltip.Positioner>
    </Portal>
</Tooltip>
