<script lang="ts">
    import ContextLog from "./ContextLog.svelte";
    import GameTabs from "./GameTabs.svelte";
</script>

<div class="grid w-full flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
    <aside class="section">
        <GameTabs />
    </aside>
    <main class="section">
        <ContextLog />
    </main>
</div>

<style lang="postcss">
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";

    .section {
        @apply flex flex-col gap-4 rounded-xl p-4
            bg-white/90 shadow-sm ring-1 ring-neutral-200/70
            dark:bg-neutral-900/80 dark:ring-neutral-700/50;
    }
</style>