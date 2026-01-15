<script lang="ts">
    import type { Game } from "$lib/api/game.svelte";
    // import VersionChip from "./VersionChip.svelte";
    import { Unplug, Braces } from "@lucide/svelte";
    import CopyButton from "$lib/ui/common/CopyButton.svelte";
    import { getUIState } from "$lib/app/utils/di";

    type Props = { game: Game };
    let { game }: Props = $props();
    const uiState = getUIState();
</script>

<div class="fcol-2">
    <!-- there's only one version currently (clueless) -->
    <!-- <VersionChip version={game.conn.version} /> -->
    <div class="connection-info">
        <p class="id-text">ID: <span class="id-value">{game.conn.id}</span></p>
        <CopyButton data={game.conn.id} desc="ID" />
    </div>
    <div class="fcol-0.5">
        <button
            class="menu-item"
            onclick={() => uiState.dialogs.openRawMessageDialog(game)}
        >
            <span class="text-secondary-500 dark:text-secondary-200">
                <Braces size={14} />
            </span>
                Send Raw Message
        </button>
        <button
            class="menu-item menu-item-danger"
            onclick={() => game.conn.disconnect()}
        >
            <Unplug size={14} /> Disconnect
        </button>
    </div>
</div>


<style lang="postcss">
    @reference "global.css";

    .connection-info {
        @apply frow-2 items-center justify-between;
    }

    .id-text {
        @apply text-sm text-neutral-600 dark:text-neutral-300 whitespace-nowrap;
    }

    .id-value {
        @apply font-mono font-medium text-neutral-800 dark:text-neutral-200 truncate;
    }

    .menu-item {
        @apply frow-1.5 items-center;
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
