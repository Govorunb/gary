<script lang="ts">
    import type { Snippet } from "svelte";
    import { arrow, autoPlacement, autoUpdate, FloatingArrow, offset, useDismiss, useFloating, useHover, useInteractions, useRole } from "@skeletonlabs/floating-ui-svelte";
    import { fade } from "svelte/transition";

    interface Props {
        tip: string | Snippet;
        placement?: "top" | "bottom" | "left" | "right";
        children: Snippet;
    }
    let {
        tip,
        placement = $bindable("top"),
        children
    }: Props = $props();

    let open = $state(false);
    let elemArrow: HTMLElement | null = $state(null);

    const floating = useFloating({
        whileElementsMounted: autoUpdate,
        get open() {
            return open;
        },
        onOpenChange(v) {
            open = v;
        },
        placement,
        get middleware() {
            return [offset(10), autoPlacement(), elemArrow && arrow({ element: elemArrow })];
        },
    });

    const interactions = useInteractions([
        useRole(floating.context, { role: "tooltip" }),
        useHover(floating.context, { move: false, delay: 300 }),
        useDismiss(floating.context),
    ])

</script>

<div>

    <span bind:this={floating.elements.reference} {...interactions.getReferenceProps()}>
        {@render children()}
    </span>
    {#if tip && open}
        <div class="floating popover-neutral tooltip-container"
        bind:this={floating.elements.floating}
        style={floating.floatingStyles}
        {...interactions.getFloatingProps()}
        transition:fade={{ duration: 50 }}
        >
            {#if typeof tip === 'string'}
                <span>{tip}</span>
            {:else}
                {@render tip()}
            {/if}
            <FloatingArrow bind:ref={elemArrow} context={floating.context} fill="light-dark(#f6f6f6, #2f2f2f)" />
        </div>
    {/if}
</div>

<style>
    .popover-neutral {
        background-color: light-dark(#f6f6f6, #2f2f2f);
        padding: 0.5rem 1rem;
        border-radius: 8px;
    }
</style>
