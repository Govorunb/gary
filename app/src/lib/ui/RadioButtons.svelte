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

<radio-picker role="radiogroup" class={_class}>
    {#each items as item, i}
        {@const dispName = typeof item === "string" ? item : i}
        <label class="input button">
            <input type="radio" group={groupName}
                id="{groupName}_{dispName}"
                value={dispName}
                data-index={i}
                checked={selectedIndex === i}
                onchange={handleChange}>
            <div class="radio-item">
                {@render renderItem(item, i)}
            </div>
        </label>
    {/each}
</radio-picker>

<style>
    radio-picker {
        display: flex;
        width: fit-content;
        line-height: 15px;
        & > label:first-child {
            border-top-left-radius: var(--border-radius);
            border-bottom-left-radius: var(--border-radius);
        }
        & > label:last-child {
            border-top-right-radius: var(--border-radius);
            border-bottom-right-radius: var(--border-radius);
        }
        label {
            &:has(input:checked) {
                background: Highlight !important;
                box-shadow: inset 0px 0px 8px 0px #888;
            }
            &:has(input:focus-visible) {
                outline: 2px solid light-dark(#000, #fff);
            }
            cursor: pointer;
            border-radius: 0;
        }
        /* accessibility (screen readers, keyboard nav) */
        input {
            opacity: 0;
            position: absolute;
            pointer-events: none;
        }
    }
</style>