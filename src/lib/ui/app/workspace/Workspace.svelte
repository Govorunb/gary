<script lang="ts">
    import type { Game } from "$lib/api/game.svelte";

    let { selectedGame }: { selectedGame: Game | null } = $props();
</script>

<div class="workspace">
    <div class="workspace-header">
        <h2>Workspace</h2>
        <span class="placeholder-chip">Placeholder</span>
    </div>

    <div class="workspace-body">
        <p class="placeholder-block">TODO: event log.</p>
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    .workspace {
        @apply fcol-3 h-full p-2;
    }

    .workspace-header {
        @apply frow-3 items-center justify-between;
        @apply border-b border-neutral-200/70 pb-2 dark:border-neutral-700/60;
    }

    .placeholder-chip {
        @apply rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide;
        @apply bg-secondary-100 text-secondary-900;
        @apply dark:bg-secondary-900/50 dark:text-secondary-100;
    }

    .workspace-body {
        @apply fcol-3 text-sm;
        @apply text-neutral-700 dark:text-neutral-200;
    }

    .placeholder-block {
        @apply fcol-2 rounded-xl border border-dashed border-neutral-300/80 p-2;
        @apply bg-white/70 dark:border-neutral-700 dark:bg-surface-800/60;
    }
</style>
