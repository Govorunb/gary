<script lang="ts">
    import { boolAttr } from "runed";
    import type { Game } from "$lib/api/game.svelte";
    import type { HTMLButtonAttributes } from "svelte/elements";

    interface Props extends HTMLButtonAttributes {
        game: Game;
        isSelected: boolean;
        onselect: () => void;
    }

    // Extra attributes come from the context menu popover, which anchors to the tab.
    let { game, isSelected, onselect, ...rest }: Props = $props();

    // Tabs overflow sideways, so the selected one has to be brought into view however it got selected.
    function keepVisible(el: HTMLElement) {
        if (isSelected) el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
</script>

<button
    {...rest}
    class="game-tab"
    type="button"
    role="tab"
    aria-selected={isSelected}
    data-selected={boolAttr(isSelected)}
    data-connected={boolAttr(!game.conn.closed)}
    data-status={game.status}
    onclick={onselect}
    title={game.name}
    {@attach keepVisible}
>
    <span class="status-dot"></span>
    <span class="game-name">{game.name}</span>
</button>

<style lang="postcss">
    @reference "global.css";

    .game-tab {
        @apply frow-1.5 items-center shrink-0 h-7 px-2.5 rounded-md;
        @apply text-sm font-medium text-ink-2 transition-colors;
        &:hover {
            @apply text-ink-1 bg-layer-2;
        }
        &[data-selected] {
            @apply text-ink-0 bg-layer-3;
        }
        &:focus-visible {
            @apply outline-none ring-2 ring-accent;
        }
    }
    .game-name {
        @apply truncate max-w-40;
    }
    .status-dot {
        @apply size-1.5 rounded-full shrink-0 bg-ink-3 transition-colors;
        .game-tab[data-connected][data-status="ok"] & { @apply bg-lvl-ok; }
        .game-tab[data-connected][data-status="warn"] & { @apply bg-lvl-warn; }
        .game-tab[data-connected][data-status="error"] & { @apply bg-lvl-err; }
    }
</style>
