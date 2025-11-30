<script lang="ts">
    import type { Game } from "$lib/api/registry.svelte";
    // import VersionChip from "./VersionChip.svelte";
    import { Unplug } from "@lucide/svelte";
    import CopyButton from "$lib/ui/common/CopyButton.svelte";

    type Props = { game: Game };
    let { game }: Props = $props();
</script>

<div class="game-tooltip">
    <div class="flex flex-col gap-2">
        <!-- there's only one version currently (clueless) -->
        <!-- <VersionChip version={game.conn.version} /> -->
        <div class="connection-info">
            <p class="id-text">ID: <span class="id-value">{game.conn.id}</span></p>
            <CopyButton data={game.conn.id} desc="ID" />
        </div>
        <div class="flex flex-row justify-end">
            <button
                class="menu-item menu-item-danger"
                onclick={() => game.conn.disconnect()}
            >
                <Unplug size={14} /> Disconnect
            </button>
        </div>
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    .game-tooltip {
        @apply relative flex flex-col gap-3 p-3;
        @apply rounded-lg shadow-lg;
        @apply bg-surface-100/95 dark:bg-surface-800/95;
        @apply ring-1 ring-neutral-200/80 dark:ring-neutral-700/60;
    }

    .connection-info {
        @apply flex items-center justify-between gap-2;
    }

    .id-text {
        @apply text-sm text-neutral-600 dark:text-neutral-300 whitespace-nowrap;
    }

    .id-value {
        @apply font-mono font-medium text-neutral-800 dark:text-neutral-200 truncate;
    }

    .menu-item {
        @apply flex flex-row gap-1.5 items-center;
        @apply w-full px-3 py-2;
        @apply rounded-sm;
        @apply text-left text-sm;
        @apply transition-colors duration-150;
        &:hover {
            @apply bg-neutral-200/70 dark:bg-neutral-700/70;
        }
        &:focus-visible {
            @apply outline-none ring-1 ring-neutral-400 dark:ring-neutral-600;
        }
    }

    .menu-item-danger {
        @apply text-error-600 dark:text-error-400;
        &:hover {
            @apply bg-error-100/50 dark:bg-error-900/30;
        }
    }

</style>