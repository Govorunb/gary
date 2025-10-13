<script lang="ts">
    import type { Game } from "$lib/api/registry.svelte";

    let { game }: { game: Game } = $props();

</script>

<div class="action-list-container">
    {#if game}
        <h3>{game.name} Actions</h3>
        {#each [...game.actions.values()] as action (action.name)}
            <details class="action">
                <summary>{action.name}</summary>
                <p>{action.description}</p>
                {#if action.schema}
                    <pre>{JSON.stringify(action.schema, null, 2)}</pre>
                {/if}
            </details>
        {/each}
    {:else}
        <p>No game selected.</p>
    {/if}
</div>

<style>
    .action-list-container {
        height: 100%;
        overflow-y: auto;
    }

    .action {
        margin-bottom: 1rem;
    }

    details > summary {
        cursor: pointer;
        font-weight: bold;
    }

    pre {
        background-color: light-dark(#eee, #333);
        padding: 0.5rem;
        border-radius: 0.25rem;
        color: inherit;
    }
</style>
