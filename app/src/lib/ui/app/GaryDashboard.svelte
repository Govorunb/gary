<script lang="ts">
    import ContextLog from "./ContextLog.svelte";
    import GameTabs from "./GameTabs.svelte";
</script>

<div class="grid flex-1 grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
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
        @apply flex flex-col gap-4 p-4 overflow-hidden
            bg-surface-100/90 shadow-sm ring-1 ring-neutral-200/70
            dark:bg-surface-900/80 dark:ring-neutral-700/50;
    }
</style>
