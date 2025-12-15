<script lang="ts">
    import { tooltip } from "$lib/app/utils";
    import { getSession } from "$lib/app/utils/di";
    import { EllipsisVertical } from "@lucide/svelte";
    import Popover from "$lib/ui/common/Popover.svelte";

    const session = getSession();

    let open = $state(false);

    function closeMenu() {
        open = false;
    }
    function clearContext() {
        session.context.reset();
        closeMenu();
    }
    function copyContext() {
        navigator.clipboard.writeText(JSON.stringify(session.context.userView));
        closeMenu();
    }
</script>

<Popover modal {open} onOpenChange={(d) => open = d.open}>
    {#snippet trigger(props)}
        <button {...props} class="menu-trigger" {@attach tooltip("Menu")}>
            <EllipsisVertical />
        </button>
    {/snippet}
    <div class="menu-content">
        <button class="menu-item" onclick={copyContext}>
            Copy as JSON
        </button>
        <button class="menu-item menu-item-danger" onclick={clearContext}>
            Reset Context
        </button>
    </div>
</Popover>

<style lang="postcss">
    @reference "global.css";

    .menu-trigger {
        @apply p-2 rounded-md;
        @apply bg-neutral-50 text-neutral-700;
        @apply dark:bg-neutral-900/30 dark:text-neutral-300;
        @apply transition-colors;
        &:hover {
            @apply bg-neutral-100;
            @apply dark:bg-neutral-800/50;
        }
    }
    .menu-content {
        @apply flex flex-col gap-1 px-1 py-1;
        @apply bg-surface-200-800 rounded-md;
        @apply border border-neutral-900/30;
        @apply min-w-40;
    }

    .menu-item {
        @apply w-full px-3 py-2;
        @apply rounded-sm;
        @apply text-left text-sm;
        @apply text-neutral-700 dark:text-neutral-300;
        @apply transition-colors duration-150;
        &:hover {
            @apply bg-neutral-200/70 dark:bg-neutral-700/70;
        }
        &:focus-visible {
            @apply outline-none ring-1 ring-neutral-400 dark:ring-neutral-600;
        }
    }

    .menu-item-danger {
        @apply text-error-600 dark:text-error-400;
        &:hover {
            @apply bg-error-100/50 dark:bg-error-900/30;
        }
    }
</style>