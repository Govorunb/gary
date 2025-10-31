<!-- adapted from https://lyra.horse/blog/2025/08/you-dont-need-js/ -->
<script lang="ts">
    import { shortId } from "$lib/app/utils.svelte";
    import type { Snippet } from "svelte";
    import type { SvelteHTMLElements } from "svelte/elements";

    type Item = string;
    type Props = {
        readonly items: readonly Item[];
        groupName?: string;
        selectedIndex?: number;
        renderItem?: Snippet<[Item, number]>;
        getItemLabelProps?: (item: Item, i: number) => SvelteHTMLElements['label'];
    }
    let {
        items,
        groupName = shortId(),
        selectedIndex = $bindable(),
        renderItem = defaultRender,
        getItemLabelProps = () => ({}),
    }: Props = $props();

    function handleChange(event: Event & { currentTarget: EventTarget & HTMLInputElement; }) {
        if (!event.currentTarget.checked) return;
        
        const iStr = event.currentTarget.attributes.getNamedItem('data-index')!.value;
        const i = parseInt(iStr);
        selectIndex(i);
    }

    export function selectIndex(i: number) {
        selectedIndex = i;
    }
    export function selectValue(val: Item) {
        const i = items.indexOf(val);
        if (i < 0) return;
        selectIndex(i);
    }
</script>

{#snippet defaultRender(item: string, i: number)}
    <span>{item}</span>
{/snippet}

<radio-picker role="radiogroup">
    {#each items as item, i}
        {@const dispName = typeof item === "string" ? item : i}
        <label {...getItemLabelProps(item, i)}>
            <input type="radio" group={groupName}
                id="{groupName}_{dispName}"
                value={dispName}
                data-index={i}
                checked={selectedIndex === i}
                onchange={handleChange}
                class="sr-only">
            <div class="flex items-center gap-2 size-full">
                {@render renderItem(item, i)}
            </div>
        </label>
    {/each}
</radio-picker>

<style lang="postcss">
@reference "tailwindcss";
@reference "@skeletonlabs/skeleton";
@reference "@skeletonlabs/skeleton-svelte";
@reference "@skeletonlabs/skeleton/themes/cerberus";

radio-picker {
@apply inline-flex overflow-visible rounded-full
        border border-neutral-200/80 bg-neutral-100
        text-sm text-neutral-700 shadow-sm
        dark:border-neutral-800/80 dark:bg-neutral-900 dark:text-neutral-200;

    & label {
        @apply relative flex cursor-pointer select-none items-center gap-2 font-medium
            px-2.5 py-1
            hover:bg-neutral-200
            size-full
            first:rounded-l-full last:rounded-r-full
            dark:hover:bg-neutral-700
            dark:active:bg-neutral-800/80;
        &:has(input:focus-visible) {
            @apply outline-2 outline-tertiary-500 outline-offset-1;
        }
        &:has(input:checked) {
            @apply bg-primary-500/20 dark:bg-primary-600;
        }
    }
}
</style>