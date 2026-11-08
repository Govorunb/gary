<script lang="ts" module>
    import type { ContextRow } from "./formatters/types";

    /** Opened from a row's menu button, or at the pointer when `point` is set. */
    export type MenuRequest = {
        row: ContextRow;
        button: HTMLButtonElement;
        point?: { x: number; y: number };
    };
</script>

<script lang="ts">
    import Popover from "#lib/ui/common/Popover.svelte";
    import { copyContextText, contextRowData } from "./copy";

    let request = $state.raw<MenuRequest | null>(null);
    let open = $state(false);

    export function show(next: MenuRequest) {
        request = next;
        open = true;
    }

    function anchorRect() {
        if (!request) return null;
        return request.point ? { ...request.point, width: 0, height: 0 } : request.button.getBoundingClientRect();
    }

    function copy(text: string) {
        void copyContextText(text);
        open = false;
    }
</script>

<!-- Reopening elsewhere while open makes a fresh menu; the old one closes on the outside press. -->
{#key request}
    <Popover {open} onOpenChange={(d) => open = d.open}
        positioning={{ placement: request?.point ? "bottom-start" : "bottom-end", getAnchorRect: anchorRect }}
        finalFocusEl={() => request?.button ?? null}
    >
        {#snippet trigger({ onclick: _toggle, ...anchor })}
            <button {...anchor} hidden></button>
        {/snippet}
        {#if request}
            {const row = $derived(request.row)}
            <button class="menu-item" onclick={() => copy(row.rendered?.text ?? "")}>Copy text</button>
            <button class="menu-item" onclick={() => copy(row.event.id)}>Copy event ID</button>
            <button class="menu-item" onclick={() => copy(JSON.stringify(contextRowData(row), null, 2))}>Copy as JSON</button>
        {/if}
    </Popover>
{/key}
