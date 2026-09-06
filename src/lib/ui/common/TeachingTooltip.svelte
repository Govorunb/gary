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
    <div class="tooltip-panel">
        {@render children()}
    </div>
</Tooltip>

<style lang="postcss">
    @reference "global.css";

    .teaching-tooltip-trigger {
        @apply text-ink-3 cursor-default transition-colors;
        &:hover { @apply text-ink-1; }
    }
</style>
