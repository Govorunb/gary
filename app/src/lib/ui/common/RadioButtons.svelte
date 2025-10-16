<!-- adapted from https://lyra.horse/blog/2025/08/you-dont-need-js/ -->
<script lang="ts">
    import type { Snippet } from "svelte";

    type Item = string;
    type Props = {
        items: Item[];
        groupName?: string;
        selectedIndex?: number;
        renderItem?: Snippet<[Item, number]>;
    }
    let {
        items,
        groupName = Math.random().toFixed(8),
        selectedIndex = $bindable(),
        renderItem = defaultRender,
    }: Props = $props();

    function handleChange(event: Event & { currentTarget: EventTarget & HTMLInputElement; }) {
        if (event.currentTarget.checked) {
            const iStr = event.currentTarget.attributes.getNamedItem('data-index')!.value;
            const i = parseInt(iStr);
            select(i);
        }
    }

    function select(i: number) {
        selectedIndex = i;
    }
    export function selectIndex(i: number) {
        select(i);
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
        <label>
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
    @apply inline-flex overflow-hidden rounded-full
        border border-neutral-200/80 bg-neutral-100
        text-sm text-neutral-700 shadow-sm;

    & label {
        @apply relative flex cursor-pointer select-none items-center gap-2 font-medium
            px-2.5 py-1
            hover:bg-neutral-200
            size-full
            first:rounded-l-full last:rounded-r-full;
        &:focus-visible {
            @apply border border-sky-500;
        }
        &:has(input:checked) {
            @apply bg-primary-500/20
            dark:bg-primary-600/50;
        }
    }
}
</style>