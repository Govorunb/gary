<script lang="ts">
    import { Popover, Portal } from "@skeletonlabs/skeleton-svelte";
    import type { Snippet } from "svelte";
    import type { SvelteHTMLElements } from "svelte/elements";
    import type { PopoverRootProps } from "@skeletonlabs/skeleton-svelte";

    type SnippetOfHTML<T extends keyof SvelteHTMLElements> = Snippet<[SvelteHTMLElements[T]]>;
    type Props = {
        trigger: SnippetOfHTML<'button'>,
        content?: SnippetOfHTML<'div'>,
        children?: Snippet,
        arrow?: boolean,
        class?: string,
    } & PopoverRootProps;

    let {
        trigger,
        content,
        children,
        arrow = false,
        class: className,
        ...props
    }: Props = $props();
</script>

<Popover {...props}>
    <Popover.Trigger element={trigger} />
    <Portal>
        <Popover.Positioner>
            <Popover.Content element={content} class={["popover-content", className]}>
                {@render children?.()}
                {#if arrow}
                    <Popover.Arrow class="global-popover-arrow">
                        <Popover.ArrowTip />
                    </Popover.Arrow>
                {/if}
            </Popover.Content>
        </Popover.Positioner>
    </Portal>
</Popover>
