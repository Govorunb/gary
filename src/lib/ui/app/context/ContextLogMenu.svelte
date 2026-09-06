<script lang="ts">
    import { tooltip } from "$lib/app/utils";
    import { getSession } from "$lib/app/utils/di";
    import { EllipsisVertical } from "@lucide/svelte";
    import Popover from "$lib/ui/common/Popover.svelte";
    import { formatContextEvent } from "./formatters/registry";
    import { EVENT_BUS } from "$lib/app/events/bus";

    const session = getSession();

    let open = $state(false);

    function closeMenu() {
        open = false;
    }
    function clearContext() {
        EVENT_BUS.emit("ui/context/reset");
        closeMenu();
    }
    function copyContext() {
        const withRenderedText = session.context.userView.map(event => ({
            ...event,
            text: formatContextEvent(event, "user")?.text ?? "",
        }));
        navigator.clipboard.writeText(JSON.stringify(withRenderedText));
        closeMenu();
    }
</script>

<Popover modal {open} onOpenChange={(d) => open = d.open}>
    {#snippet trigger(props)}
        <button {...props} class="icon-btn" {@attach tooltip("Menu")}>
            <EllipsisVertical />
        </button>
    {/snippet}
    <button class="menu-item" onclick={copyContext}>
        Copy as JSON
    </button>
    <button class="menu-item menu-item-danger" onclick={clearContext}>
        Reset Context
    </button>
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
