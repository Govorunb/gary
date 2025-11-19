<script lang="ts">
    import type { Game } from "$lib/api/registry.svelte";
    import VersionBadge from "./VersionBadge.svelte";
    import { Unplug } from "@lucide/svelte";
    import CopyButton from "../common/CopyButton.svelte";

    type Props = { game: Game };
    let { game }: Props = $props();
</script>

<div class="game-tooltip">
    <div class="tooltip-header">
        <div class="header-row">
            <VersionBadge version={game.conn.version} />
            <button
                class="disconnect-button"
                onclick={() => game.conn.disconnect()}
            >
                <Unplug size={14} /> Disconnect
            </button>
        </div>
        <div class="connection-info">
            <p class="id-text">ID: <span class="id-value">{game.conn.id}</span></p>
            <CopyButton data={game.conn.id} />
        </div>
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    .game-tooltip {
        @apply relative flex flex-col gap-3 p-3 rounded-lg
            bg-surface-100/95 shadow-lg ring-1 ring-neutral-200/80
            dark:bg-surface-800/95 dark:ring-neutral-700/60;
    }

    .tooltip-header {
        @apply flex flex-col gap-2;
    }

    .header-row {
        @apply flex items-center justify-between;
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

    .disconnect-button {
        @apply p-1.5 rounded-md flex flex-row gap-1.5 items-center
            bg-red-500 text-white
            hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400
            transition-colors duration-150;
    }

</style>