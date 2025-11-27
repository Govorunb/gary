<script lang="ts">
    import ContextLog from "$lib/ui/app/context/ContextLog.svelte";
    import GameTabs from "$lib/ui/app/game/GameTabs.svelte";
</script>

<div class="grid flex-1 grid-cols-[1.1fr_4fr]">
    <div class="section">
        <GameTabs />
    </div>
    <div class="section">
        <ContextLog />
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    .section {
        @apply flex flex-col gap-4 p-4 overflow-hidden;
        @apply bg-surface-100/90 shadow-sm ring-1 ring-neutral-200/70;
        @apply dark:bg-surface-900/80 dark:ring-neutral-700/50;
    }
</style>
