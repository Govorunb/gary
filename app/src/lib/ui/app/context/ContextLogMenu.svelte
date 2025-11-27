<script lang="ts">
    import { tooltip } from "$lib/app/utils";
    import { getSession } from "$lib/app/utils/di";
    import { EllipsisVertical } from "@lucide/svelte";
    import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';

    interface Props {
        open: boolean;
        onOpenChange: (open: boolean) => void;
    }

    const { open, onOpenChange }: Props = $props();
    const session = getSession();

    function closeMenu() {
        onOpenChange(false);
    }
    function clearContext() {
        session.context.clear();
        closeMenu();
    }
    function copyContext() {
        navigator.clipboard.writeText(JSON.stringify(session.context.userView));
        closeMenu();
    }
</script>

<Popover modal open={open} onOpenChange={(d) => onOpenChange(d.open)}>
    <Popover.Trigger>
        {#snippet element(props)}
            <button {...props} class="menu-trigger" {@attach tooltip("Menu")}>
                <EllipsisVertical />
            </button>
        {/snippet}
    </Popover.Trigger>
    <Portal>
        <Popover.Positioner class="z-20!">
            <Popover.Content>
                <div class="menu-content">
                    <button class="btn preset-tonal-surface" onclick={copyContext}>
                        Copy as JSON
                    </button>
                    <!-- TODO: reset instead of clear (add sys prompt first) -->
                    <button class="btn preset-filled-error-500" onclick={clearContext}>
                        Clear Context
                    </button>
                </div>
            </Popover.Content>
        </Popover.Positioner>
    </Portal>
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
        @apply flex flex-col gap-2 px-3 py-2;
        @apply bg-surface-200-800 rounded-lg;
        @apply border-2 border-neutral-900/30;
    }
</style>