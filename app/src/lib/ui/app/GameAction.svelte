<script lang="ts">
    import type { Action } from "$lib/api/v1/spec";
    import { getSession } from "$lib/app/utils/di";
    import { renderJson } from "$lib/app/utils/shiki";
    type Props = {
        action: Action;
    };

    let { action }: Props = $props();

    const session = getSession();

    const actionJson = $derived(action.schema && JSON.stringify(action.schema, null, 2));
</script>

<details class="accordion">
    <summary>{action.name}</summary>
    <div class="space-y-2 px-4 pb-4 pt-2 text-neutral-600 dark:text-neutral-200">
        <p>{action.description}</p>
    {#if actionJson}
        <div class="schema">
            {#await renderJson(actionJson) then html}
                {@html html}
            {/await}
        </div>
    {/if}
    </div>
</details>

<style lang="postcss">
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";

    details.accordion {
        @apply mb-3 rounded-lg border border-neutral-200/70 bg-white/80 shadow-sm transition dark:border-neutral-700 dark:bg-neutral-900/60;
        & > summary {
            @apply flex cursor-pointer items-center justify-between gap-2 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:text-neutral-200 dark:hover:bg-neutral-800/70;
        }
    }
    .schema {
        @apply rounded-md bg-neutral-800 p-3 text-xs text-neutral-100 shadow-inner;
    }

</style>