<script lang="ts">
    import type { Game } from "$lib/api/registry.svelte";

    let { game }: { game: Game } = $props();

</script>

<div class="flex h-full flex-col overflow-y-auto pr-1 text-sm">
    {#if game}
        <h3 class="mb-4 text-base font-semibold text-neutral-800 dark:text-neutral-100">{game.name} Actions</h3>
        {#each [...game.actions.values()] as action (action.name)}
            <details class="group mb-3 rounded-lg border border-neutral-200/70 bg-white/80 shadow-sm transition dark:border-neutral-700 dark:bg-neutral-900/60">
                <summary class="flex cursor-pointer items-center justify-between gap-2 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:text-neutral-200 dark:hover:bg-neutral-800/70">
                    {action.name}
                </summary>
                <div class="space-y-2 px-4 pb-4 pt-2 text-neutral-600 dark:text-neutral-200">
                    <p>{action.description}</p>
                {#if action.schema}
                    <pre class="overflow-x-auto rounded-md bg-neutral-800 p-3 text-xs text-neutral-100 shadow-inner">{JSON.stringify(action.schema, null, 2)}</pre>
                {/if}
                </div>
            </details>
        {/each}
    {:else}
        <p class="text-neutral-600 dark:text-neutral-300">No game selected.</p>
    {/if}
</div>
