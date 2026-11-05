<script lang="ts">
    import { tooltip } from "#lib/app/utils/index.js";
    import { EllipsisVertical } from "@lucide/svelte";
    import Popover from "#lib/ui/common/Popover.svelte";
    import type { ContextRow } from "./formatters/types";
    import { copyContextText, contextRowData } from "./copy";
    import { getSession } from "#lib/app/utils/di.js";
    import { COMMANDS } from "#lib/app/commands.js";

    const { rows }: { rows: ContextRow[] } = $props();
    const session = getSession();

    let open = $state(false);

    function closeMenu() {
        open = false;
    }
    function clearContext() {
        void session.run(COMMANDS.clearContext, {});
        closeMenu();
    }
    function copyContext(format: "text" | "json") {
        const text = format === "json"
            ? JSON.stringify(rows.map(contextRowData), null, 2)
            : rows.map(row => row.rendered?.text ?? "").join("\n\n");
        void copyContextText(text);
        closeMenu();
    }
</script>

<Popover modal {open} onOpenChange={(d) => open = d.open}>
    {#snippet trigger(props)}
        <button {...props} class="icon-btn" {@attach tooltip("Menu")}>
            <EllipsisVertical />
        </button>
    {/snippet}
    <button class="menu-item" onclick={() => copyContext("text")} disabled={!rows.length}>
        Copy as text
    </button>
    <button class="menu-item" onclick={() => copyContext("json")} disabled={!rows.length}>
        Copy as JSON
    </button>
    {#if session.live}
        <button class="menu-item menu-item-danger" onclick={clearContext}>
            Reset Context
        </button>
    {/if}
</Popover>

<style lang="postcss">
    @reference "global.css";

    .menu-item-danger {
        @apply text-lvl-err;
        &:hover {
            @apply bg-lvl-err/12;
        }
    }
</style>
