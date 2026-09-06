<script lang="ts">
    import { CircleX, X } from "@lucide/svelte";
    import { getSession } from "$lib/app/utils/di";

    const session = getSession();
    const reason = $derived(session.scheduler.errored ? session.scheduler.errorReason : null);

    // Closing hides the notice for this stop only; the next stop shows it again.
    let dismissed = $state(false);
    const shown = $derived(reason !== null && !dismissed);
    $effect(() => {
        if (!session.scheduler.errored) dismissed = false;
    });
</script>

{#if shown}
    <div class="stopped-notice" role="status">
        <CircleX class="size-3.5 shrink-0 mt-px text-lvl-err" />
        <span class="reason">Stopped: {reason}</span>
        <button class="close" type="button" onclick={() => dismissed = true} aria-label="Dismiss">
            <X class="size-3.5" />
        </button>
    </div>
{/if}

<style lang="postcss">
    @reference "global.css";

    /* Hangs from the bottom edge of the top bar, centered under the engine controls. */
    .stopped-notice {
        @apply absolute left-1/2 top-full -translate-x-1/2 z-10;
        @apply frow-2 items-start px-3 pt-1.5 pb-2 rounded-b-lg;
        @apply bg-layer-3 text-ink-1 text-xs shadow-md;
        width: max(17.5rem, min(30rem, calc(100vw - 38.75rem)));
    }
    .reason {
        @apply flex-1 min-w-0 wrap-anywhere;
    }
    .close {
        @apply inline-flex items-center justify-center size-5 shrink-0 rounded text-ink-3 transition-colors;
        &:hover { @apply text-ink-0 bg-layer-4; }
        &:focus-visible { @apply outline-none ring-2 ring-accent; }
    }
</style>
