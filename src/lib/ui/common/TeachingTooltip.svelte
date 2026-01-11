<script lang="ts">
    import type { Snippet } from "svelte";
    import { CircleQuestionMark } from "@lucide/svelte";
    import Tooltip from "./Tooltip.svelte";

    type Props = {
        interactive?: boolean;
        icon?: Snippet;
        children: Snippet;
    };

    let {
        interactive = true,
        icon = defaultIcon,
        children
    }: Props = $props();
</script>

{#snippet defaultIcon()}
    <CircleQuestionMark />
{/snippet}

<Tooltip closeOnClick={false} {interactive}>
    {#snippet trigger(props)}
        <button {...props} class="teaching-tooltip-trigger">
            {@render icon()}
        </button>
    {/snippet}
    <div class="teaching-tooltip-content">
        {@render children()}
    </div>
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
        @apply fcol-1 bg-neutral-100 dark:bg-surface-800 rounded-md p-4 shadow-xl;
        @apply text-xs text-neutral-500 dark:text-neutral-300;
    }
</style>