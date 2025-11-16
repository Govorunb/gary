<script lang="ts">
    import type { Game } from "$lib/api/registry.svelte";
    import GameAction from "./GameAction.svelte";

    type Props = {
        game: Game;
    };

    let { game }: Props = $props();

</script>

<div class="flex h-full flex-col gap-2 overflow-y-auto pr-1 text-sm mt-2">
    {#each [...game.actions.values()] as action (action.name)}
        <GameAction {action} />
    {/each}
</div>
