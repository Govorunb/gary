<script lang="ts">
    import type { Snippet } from "svelte";
    import TeachingTooltip from "../TeachingTooltip.svelte";

    let { help, tip = false }: { help: string | Snippet; tip?: boolean } = $props();
</script>

{#snippet text()}
    {#if typeof help === "string"}
        {#if tip}<p>{help}</p>{:else}<div class="field-description">{help}</div>{/if}
    {:else}
        {@render help()}
    {/if}
{/snippet}

{#if tip}
    <TeachingTooltip>{@render text()}</TeachingTooltip>
{:else}
    {@render text()}
{/if}
