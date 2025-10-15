<!-- adapted from https://lyra.horse/blog/2025/08/you-dont-need-js/ -->
<script lang="ts">
    import type { Snippet } from "svelte";
    import type { ClassValue } from "svelte/elements";

    type Item = string;
    type Props = {
        items: Item[];
        groupName?: string;
        selectedIndex?: number;
        class?: ClassValue;
        renderItem?: Snippet<[Item, number]>;
    }
    let {
        items,
        groupName = Math.random().toFixed(8),
        selectedIndex = $bindable(),
        class: _class,
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

<radio-picker role="radiogroup" class={`inline-flex overflow-hidden rounded-full border border-neutral-200/80 bg-neutral-100/80 text-sm text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-200 ${_class ?? ""}`}>
    {#each items as item, i}
        {@const dispName = typeof item === "string" ? item : i}
        {@const isActive = selectedIndex === i}
        <label
            class={`relative flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 font-medium transition hover:bg-neutral-200/80 focus-within:ring-2 focus-within:ring-sky-500/60 focus-within:ring-offset-2 focus-within:ring-offset-neutral-100 dark:hover:bg-neutral-800/70 dark:focus-within:ring-offset-neutral-900 first:rounded-l-full last:rounded-r-full ${i < items.length - 1 ? "border-r border-neutral-200/60 dark:border-neutral-700/80" : ""} ${isActive ? "bg-sky-500/20 text-sky-700 shadow-inner dark:bg-sky-500/30 dark:text-sky-100" : "text-neutral-700 dark:text-neutral-200"}`}>
            <input type="radio" group={groupName}
                id="{groupName}_{dispName}"
                value={dispName}
                data-index={i}
                checked={selectedIndex === i}
                onchange={handleChange}
                class="peer sr-only" >
            <div class="flex items-center gap-2">
                {@render renderItem(item, i)}
            </div>
        </label>
    {/each}
</radio-picker>