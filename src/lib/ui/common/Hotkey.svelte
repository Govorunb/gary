<script lang="ts">
    import type { Snippet } from "svelte";

    type Props = {
        children: Snippet;
    }
    let { children }: Props = $props();
</script>

<code class="hotkey">
    {@render children()}
</code>

<style lang="postcss">
    @reference "global.css";

    .hotkey {
        @apply inline-flex flex-row gap-2 items-center justify-center;
        @apply px-1.5 py-0.5 rounded;
        @apply text-xs whitespace-nowrap;
        @apply preset-outlined-surface-200-800;
        @apply text-neutral-800 dark:text-neutral-100;
        @apply bg-surface-100/60 dark:bg-surface-900/60;
    }
</style>