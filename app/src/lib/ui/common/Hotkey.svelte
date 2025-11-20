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
        @apply chip preset-outlined-surface-200-800 px-1.5 py-0.5;
        @apply text-neutral-800 dark:text-neutral-100;
        @apply bg-surface-100/60 dark:bg-surface-900/60;
    }
</style>