<script lang="ts">
    import { getRegistry, getUIState } from "$lib/app/utils/di";
    import GameTab from "./GameTab.svelte";
    import GameAction from "./GameAction.svelte";
    import GameMenu from "./GameMenu.svelte";
    import Popover from "$lib/ui/common/Popover.svelte";
    import { Plus, EllipsisVertical } from "@lucide/svelte";
    import ConnectClientPopover from "./ConnectClientPopover.svelte";
    import { startSchemaTest } from "./internal-connections";
    import { tooltip } from "$lib/app/utils";
    import type { Game } from "$lib/api/game.svelte";

    const registry = getRegistry();
    const uiState = getUIState();

    const games = $derived(registry.games);
    const selectedGame = $derived(games[uiState.selectedGameTab] ?? null);
    const activeActions = $derived(
        selectedGame ? [...selectedGame.actions.values()].filter((a) => a.active) : []
    );

    let gameMenuOpen = $state(false);
    // Right-clicking a tab opens the same menu anchored on that tab.
    let contextMenuFor = $state<string | null>(null);
    $effect(() => {
        if (uiState.anyDialogOpen) {
            gameMenuOpen = false;
            contextMenuFor = null;
        }
    });
    // The menu belongs to whichever game is selected; a switch (or a disconnect) must not leave it stuck open.
    $effect(() => {
        void selectedGame;
        gameMenuOpen = false;
    });

    // Tabs scroll sideways; map the wheel so a plain scroll reaches the hidden ones.
    function scrollTabs(evt: WheelEvent) {
        const el = evt.currentTarget as HTMLElement;
        if (el.scrollWidth <= el.clientWidth || evt.deltaY === 0) return;
        evt.preventDefault();
        el.scrollLeft += evt.deltaY;
    }

    function statusTip(game: Game) {
        switch (game.status) {
            case "ok": return "No diagnostics";
            case "warn":
            case "error":
                return `${game.diagnostics.diagnostics.length} diagnostic(s)`;
        }
    }
</script>

<div class="game-tabs-shell">
    <div class="column-header">
        {#if games.length > 0}
            <div class="tabs" role="tablist" onwheel={scrollTabs}>
                {#each games as game, i (game.conn.id)}
                    <Popover
                        open={contextMenuFor === game.conn.id}
                        onOpenChange={(d) => { if (!d.open && contextMenuFor === game.conn.id) contextMenuFor = null; }}
                    >
                        {#snippet trigger({ onclick: _toggle, ...anchor })}
                            <GameTab
                                {...anchor}
                                {game}
                                isSelected={uiState.selectedGameTab === i}
                                onselect={() => { uiState.selectGameTab(game.conn.id); contextMenuFor = null; }}
                                oncontextmenu={(e) => {
                                    e.preventDefault();
                                    uiState.selectGameTab(game.conn.id);
                                    contextMenuFor = game.conn.id;
                                }}
                            />
                        {/snippet}
                        <GameMenu {game} />
                    </Popover>
                {/each}
            </div>
        {:else}
            <span>Games</span>
        {/if}
        <span class="spacer"></span>
        <ConnectClientPopover>
            {#snippet trigger(props)}
                <button {...props} class="icon-btn" type="button" title="Connect client" aria-label="Connect client">
                    <Plus />
                </button>
            {/snippet}
        </ConnectClientPopover>
    </div>

    {#if selectedGame}
        {const game = $derived(selectedGame)}
        <div class="actions-header">
            <span>Actions</span>
            <span class="spacer"></span>
            <!-- svelte-ignore a11y_consider_explicit_label : tooltip() sets title -->
            <button
                class="icon-btn"
                type="button"
                data-status={game.status}
                onclick={() => uiState.dialogs.openDiagnosticsDialog(game)}
                {@attach tooltip(statusTip(game) + ". Click to view diagnostics")}
            >
                <span class="diag-dot"></span>
            </button>
            {#key game.conn.id}
                <Popover open={gameMenuOpen} onOpenChange={(d) => gameMenuOpen = d.open}
                    onFocusOutside={(_) => gameMenuOpen = false}
                >
                    {#snippet trigger(props)}
                        <button {...props} class="icon-btn" type="button" title="Game menu" aria-label="Game menu">
                            <EllipsisVertical />
                        </button>
                    {/snippet}
                    <GameMenu {game} />
                </Popover>
            {/key}
        </div>
        <div class="action-list">
            {#each activeActions as action (action.name)}
                <GameAction {action} {game} />
            {:else}
                <p class="empty">No actions registered.</p>
            {/each}
        </div>
    {:else}
        <div class="empty-state">
            <p>No games connected.</p>
            <button class="schema-test-button" onclick={() => startSchemaTest(registry)}>
                Schema Test
            </button>
        </div>
    {/if}
</div>

<style lang="postcss">
    @reference "global.css";

    .game-tabs-shell {
        @apply h-full fcol-0 min-h-0;
    }
    .column-header {
        @apply pl-1.5 pr-2;
    }
    .tabs {
        @apply frow-1 items-center min-w-0 overflow-x-auto;
        scrollbar-width: none;
    }
    .actions-header {
        @apply frow-1 items-center shrink-0 h-8 pl-3 pr-2;
        @apply text-xs font-semibold text-ink-2 select-none;
        & .spacer { @apply flex-1; }
    }
    .diag-dot {
        @apply size-2 rounded-full bg-ink-3;
        .icon-btn[data-status="ok"] & { @apply bg-lvl-ok; }
        .icon-btn[data-status="warn"] & { @apply bg-lvl-warn; }
        .icon-btn[data-status="error"] & { @apply bg-lvl-err; }
    }
    .action-list {
        @apply fcol-0 flex-1 min-h-0 overflow-y-auto px-2 pb-2;
        gap: 1px;
    }
    .empty {
        @apply px-2 py-4 text-center text-ink-3;
    }
    .empty-state {
        @apply fcol-3 items-center justify-center flex-1 text-ink-2;
    }
    .schema-test-button {
        @apply h-8 px-3 rounded-md text-sm font-medium;
        @apply bg-accent text-white transition;
        &:hover { filter: brightness(1.1); }
        &:focus-visible {
            @apply outline-none ring-2 ring-offset-2 ring-accent ring-offset-layer-1;
        }
    }
</style>
