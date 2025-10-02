<!-- https://lyra.horse/blog/2025/08/you-dont-need-js/ -->
<script lang="ts">
    type Item = string | number;
    type Props = {
        items: Item[];
        groupName?: string;
        selectedIndex?: number;
        pill?: boolean;
    }
    let {
        items,
        groupName = Math.random().toFixed(8),
        selectedIndex = $bindable(),
        pill,
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

<radio-picker role="radiogroup" class={{ pill }}>
    {#each items as item, i}
        {@const dispName = item}
        <label>
            <input type="radio" group={groupName}
                id="{groupName}_{dispName}"
                value={dispName}
                data-index={i}
                checked={selectedIndex === i}
                onchange={handleChange}>
            {dispName}
        </label>
    {/each}
</radio-picker>

<style>
    radio-picker {
        display: flex;
        width: fit-content;
        --border-radius: 8px;
        line-height: 15px;
        &.pill {
            --border-radius: 15px;
            line-height: 10px;
        }
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
                background: Highlight;
                box-shadow: inset 0px 0px 8px 0px #888;
            }
            &:has(input:focus-visible) {
                outline: 2px solid light-dark(#000, #fff);
            }
            box-shadow: inset 0px 0px 1.2px 0px #000;
            padding: 10px;
            cursor: pointer;
            --shade: #000;
            /* background: rgb(from var(--shade) r g b / 10%); */
            &:hover {
                background: rgb(from currentColor r g b / 20%);
            }
            &:active {
                background: rgb(from currentColor r g b / 40%);
            }
            padding: 0.6em 1.2em;
            font-size: 1em;
            font-weight: 500;
            font-family: inherit;
            color: light-dark(#0f0f0f, #ffffff);
            background-color: light-dark(#ffffff, #0f0f0f98);
            transition: border-color 0.25s, background-color 0.15s;
            box-shadow: 0 2px 2px rgba(0, 0, 0, 0.2);
            &:disabled {
                background-color: light-dark(#aaaaaa, #0f0f0f30);
                color: light-dark(#aaaaaa, #777777);
            }
        }
        /* accessibility (screen readers, keyboard nav) */
        input {
            opacity: 0;
            position: absolute;
            pointer-events: none;
        }
    }
</style>