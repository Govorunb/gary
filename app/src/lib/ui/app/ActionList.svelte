<script lang="ts">
    import type { Game } from "$lib/api/registry.svelte";
    import GameAction from "./GameAction.svelte";

    type Props = {
        game: Game;
    };

    let { game }: Props = $props();

</script>

<div class="flex h-full flex-col overflow-y-auto pr-1 text-sm">
    {#if game}
        {#each [...game.actions.values()] as action (action.name)}
            <GameAction {action} />
        {/each}
    {:else}
        <p class="text-neutral-600 dark:text-neutral-300">No game selected.</p>
    {/if}
</div>
