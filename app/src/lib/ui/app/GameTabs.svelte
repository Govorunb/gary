<script lang="ts">
    import { getRegistry, getSession } from "$lib/app/utils/di";
    import GameActionList from "./GameActionList.svelte";
    import Tooltip from "../common/Tooltip.svelte";
    import { clamp, horizontalScroll } from "$lib/app/utils";
    import GameTooltip from "./GameTooltip.svelte";
    import { InternalWSConnection, GameWSSender } from "$lib/api/ws";
    import { SchemaTestGame } from "$lib/app/schema-test";

    let registry = getRegistry();
    let activeTab = $state(0);

    $effect(() => {
        activeTab = clamp(activeTab, 0, registry.games.length - 1);
    });

    async function startSchemaTest() {
        const conn = new InternalWSConnection(`schema-test-${Date.now()}`, "v1");
        const schemaTestGame = new SchemaTestGame(new GameWSSender(conn));
        
        registry.createGame("JSON Schema Test", conn);

        await schemaTestGame.lifecycle();
    }
</script>

<div class="flex h-full flex-col">
    {#if registry.games.length > 0}
        <div class="flex items-end gap-2 border-b border-neutral-200 dark:border-neutral-700 overflow-x-scroll"
            {@attach horizontalScroll}
        >
            {#each registry.games as game, i (game.conn.id)}
                <!-- TODO: context menu -->
                <!-- TODO: retain UI on disconnect -->
                <Tooltip interactive>
                    {#snippet trigger(attrs)}
                        <button
                            {...attrs}
                            class={`relative flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:focus-visible:ring-sky-500 ${activeTab === i ? "border-b-sky-500 text-neutral-900 dark:text-neutral-50" : "border-b-transparent text-neutral-500 hover:border-b-sky-300 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"} ${game.conn.closed ? "opacity-60" : ""}`}
                            onclick={() => activeTab = i}
                        >
                            <span>{game.name}</span>
                        </button>
                    {/snippet}
                    <GameTooltip {game} />
                </Tooltip>
            {/each}
        </div>
        <div class="mt-4 flex-1 overflow-hidden">
            <GameActionList game={registry.games[activeTab]} />
        </div>
    {:else}
        <p class="text-sm text-neutral-600 dark:text-neutral-300">No games connected.</p>
        <button
            class="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900"
            onclick={startSchemaTest}
        >
            Schema Test
        </button>
    {/if}
</div>
