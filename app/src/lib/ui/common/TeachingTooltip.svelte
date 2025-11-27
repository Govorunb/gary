<script lang="ts">
    import type { Snippet } from "svelte";
    import { CircleQuestionMark } from "@lucide/svelte";
    import { Tooltip, Portal } from "@skeletonlabs/skeleton-svelte";

    type Props = {
        interactive?: boolean;
        children: Snippet;
    };

    let {
        interactive = true,
        children
    }: Props = $props();
</script>

<Tooltip closeOnClick={false} {interactive}>
    <Tooltip.Trigger>
        {#snippet element(props)}
            <button {...props} class="teaching-tooltip-trigger">
                <CircleQuestionMark />
            </button>
        {/snippet}
    </Tooltip.Trigger>
    <Portal>
        <Tooltip.Positioner>
            <Tooltip.Content>
                <div class="teaching-tooltip-content">
                    {@render children()}
                </div>
            </Tooltip.Content>
        </Tooltip.Positioner>
    </Portal>
</Tooltip>

<style lang="postcss">
    @reference "global.css";

    .teaching-tooltip-trigger {
        @apply text-neutral-400;
        @apply cursor-default;
        &:hover {
            @apply text-neutral-600 dark:text-neutral-200;
        }
    }
    
    .teaching-tooltip-content {
        @apply card flex flex-col gap-1 bg-neutral-100 dark:bg-surface-800 rounded-md p-4 shadow-xl;
        @apply text-xs text-neutral-500 dark:text-neutral-300;
    }
</style>