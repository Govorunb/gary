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
            <span class="text-src-actor">
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
        @apply text-sm text-ink-2 whitespace-nowrap;
    }

    .id-value {
        @apply font-mono font-medium text-ink-1 truncate;
    }

</style>
