<!-- adapted from https://lyra.horse/blog/2025/08/you-dont-need-js/ -->
<script lang="ts">
    import { shortId } from "$lib/app/utils";
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
        {const dispName = typeof item === "string" ? item : i}
        <label {...getItemLabelProps(item, i)}>
            <input type="radio" group={groupName}
                id="{groupName}_{dispName}"
                value={dispName}
                data-index={i}
                checked={selectedIndex === i}
                onchange={handleChange}
                class="sr-only">
            <div class="frow-2 items-center size-full">
                {@render renderItem(item, i)}
            </div>
        </label>
    {/each}
</radio-picker>

<style lang="postcss">
@reference "global.css";

radio-picker {
    @apply inline-flex overflow-visible rounded-full;
    @apply bg-layer-2 ring-1 ring-inset ring-edge text-sm text-ink-1;

    & label {
        @apply relative frow-2 cursor-pointer select-none items-center font-medium whitespace-nowrap;
        @apply px-2.5 py-1 size-full transition-colors;
        @apply first:rounded-l-full last:rounded-r-full;

        &:hover { @apply bg-layer-3 text-ink-0; }
        &:has(input:focus-visible) { @apply outline-2 outline-accent outline-offset-1; }
        &:has(input:checked) {
            @apply text-accent;
            background-color: color-mix(in oklab, var(--color-accent) 18%, transparent);
        }
    }
}
</style>
