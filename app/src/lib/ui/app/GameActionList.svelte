<script lang="ts">
    import type { Game } from "$lib/api/registry.svelte";
    import GameAction from "./GameAction.svelte";

    type Props = {
        game: Game;
    };

    let { game }: Props = $props();

</script>

<div class="action-list">
    {#each [...game.actions.values()] as action (action.name)}
        <GameAction {action} />
    {/each}
</div>

<style lang="postcss">
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";

    .action-list {
        @apply flex h-full flex-col gap-2 overflow-y-auto pr-1 text-sm mt-2;
    }
</style>
