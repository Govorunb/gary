<script lang="ts">
    import { boolAttr } from "runed";
    import { EllipsisVertical } from "@lucide/svelte";
    import GameAction from "./GameAction.svelte";
    import GameMenu from "./GameMenu.svelte";
    import Popover from "$lib/ui/common/Popover.svelte";
    import type { Game } from "$lib/api/game.svelte";
    import { getUIState } from "$lib/app/utils/di";
    import { tooltip } from "$lib/app/utils";

    interface Props {
        game: Game;
        isSelected: boolean;
    }

    const uiState = getUIState();

    let { game, isSelected }: Props = $props();
    let gameMenuOpen = $state(false);

    const seenActions = $derived([...game.actions.values()]);
    const activeActions = $derived(seenActions.filter(a => a.active));

    $effect(() => {
        if (uiState.anyDialogOpen) {
            gameMenuOpen = false;
        }
    });

    function statusTip(game: Game) {
        switch (game.status) {
            case "ok": return "OK";
            case "warn":
            case "error":
                return `${game.diagnostics.diagnostics.length} diagnostic(s)`;
        }
    }
</script>

<details class="game-tab" name="games-accordion" open={isSelected}>
    <summary class="game-tab-header">
        <div class="game-info">
            <span class="game-name">{game.name}</span>
        </div>
        <div class="game-controls">
            <!-- svelte-ignore a11y_consider_explicit_label : tooltip() sets title -->
            <button class="status-indicator p-2"
                data-connected={!game.conn.closed}
                data-status={game.status}
                {@attach tooltip(statusTip(game) + ". Click to view diagnostics")}
                onclick={() => uiState.dialogs.openDiagnosticsDialog(game)}
            >
                <div class="status-dot"></div>
            </button>
            <Popover open={gameMenuOpen} onOpenChange={(d) => gameMenuOpen = d.open}
                onFocusOutside={(_) => gameMenuOpen = false}
            >
                {#snippet trigger(props)}
                    <button {...props} class="menu-trigger">
                        <EllipsisVertical />
                    </button>
                {/snippet}
                <GameMenu {game} />
            </Popover>
        </div>
    </summary>

    <div class="game-content action-list">
        {#each activeActions as action (action.name)}
            <GameAction {action} {game} />
        {/each}
    </div>
</details>

<style lang="postcss">
    @reference "global.css";

    details.game-tab {
        @apply flex flex-col overflow-y-hidden;
        @apply rounded-lg shadow-sm transition-all;
        @apply border border-neutral-200/70 dark:border-neutral-700;
        @apply bg-white/80 dark:bg-neutral-900/60;

        &[open] {
            @apply border-sky-300 dark:border-sky-600;
            @apply shadow-md flex-1;
        }

        &:not([open]):hover {
            @apply bg-neutral-50/80 dark:bg-neutral-800/70;
        }

        summary.game-tab-header {
            @apply flex cursor-pointer items-center justify-between gap-2;
            @apply px-3 py-2 text-sm font-medium text-neutral-700 transition;
            @apply focus:outline-none;
            &:focus-visible {
                @apply ring-2 ring-sky-400 ring-inset;
            }
            @apply dark:text-neutral-200;
        }

        /* whoever decided not to make this pseudoelement a header in the docs - dishonor upon your family */
        &::details-content {
            @apply overflow-y-scroll;
        }
    }

    .game-info {
        @apply flex items-center gap-2 flex-1 min-w-0 text-lg font-medium;
    }

    .game-name {
        @apply truncate max-w-[calc(100%-1rem)];
    }

    .game-controls {
        @apply flex items-center gap-2 shrink-0;
    }

    .status-indicator {
        @apply flex items-center justify-center;

        .status-dot {
            @apply bg-neutral-200;
        }

        &:not([data-connected]) {
            @apply brightness-75;
        }

        &[data-status="ok"] .status-dot {
            @apply bg-green-500;
        }

        &[data-status="warn"] .status-dot {
            @apply bg-warning-500;
        }

        &[data-status="error"] .status-dot {
            @apply bg-red-500;
        }
    }

    .status-dot {
        @apply w-2 h-2 rounded-full;
        @apply transition-colors;
    }

    .menu-trigger {
        @apply p-1 rounded-md;
        @apply text-neutral-500;
        @apply transition-colors;
        &:hover {
            @apply bg-neutral-100;
            @apply dark:bg-neutral-800/50;
            @apply text-neutral-700 dark:text-neutral-300;
        }
    }

    .game-content {
        @apply border-t border-neutral-200/50 dark:border-neutral-700/50;
    }

    .action-list {
        @apply flex flex-col gap-1 p-2;
    }
</style>