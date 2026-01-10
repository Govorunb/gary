<script lang="ts">
    import { Dialog, Portal } from "@skeletonlabs/skeleton-svelte";
    import type { Snippet } from "svelte";
    import type { SvelteHTMLElements } from "svelte/elements";
    import type { DialogRootProps } from "@skeletonlabs/skeleton-svelte";

    type SnippetOfHTML<T extends keyof SvelteHTMLElements> = Snippet<[SvelteHTMLElements[T]]>;
    type Props = {
        open?: boolean,
        trigger?: SnippetOfHTML<'button'>,
        content?: SnippetOfHTML<'div'>,
        children?: Snippet,
        title?: Snippet,
        body?: Snippet,
        footer?: Snippet,
        position?: 'center' | 'top-start',
    } & DialogRootProps;

    let {
        open = $bindable(),
        trigger,
        content,
        children,
        title,
        body,
        footer,
        position = 'center',
        ...props
    }: Props = $props();

    const positionClasses = {
        'center': 'fixed inset-0 flex justify-center items-center align-middle',
        'top-start': 'fixed inset-0 flex justify-center items-start pt-[15vh]'
    };
</script>

<Dialog {open} onOpenChange={(d) => open = d.open} {...props}>
    {#if trigger}
        <Dialog.Trigger element={trigger} />
    {/if}
    <Portal>
        <Dialog.Backdrop class="fixed inset-0 bg-black/20 backdrop-blur-sm transition-opacity" />
        <Dialog.Positioner class={positionClasses[position]}>
            <Dialog.Content element={content} class="dialog-content">
                {#if title}
                    <div class="dialog-header">
                        {@render title()}
                    </div>
                {/if}
                {#if body}
                    <div class="dialog-body">
                        {@render body()}
                    </div>
                {/if}
                {#if footer}
                    <div class="dialog-footer">
                        {@render footer()}
                    </div>
                {/if}
                {@render children?.()}
            </Dialog.Content>
        </Dialog.Positioner>
    </Portal>
</Dialog>