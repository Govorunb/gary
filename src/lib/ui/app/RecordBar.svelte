<script lang="ts">
    import { History } from "@lucide/svelte";
    import { getSession, getSessions } from "#lib/app/utils/di.js";

    const sessions = getSessions();
    const session = getSession();
</script>

<div class="record-bar" role="status">
    <History class="record-icon" />
    <span class="record-name">{session.name}</span>
    <button class="btn back-btn" onclick={() => sessions.showLive()}>Back to live session</button>
</div>

<style lang="postcss">
    @reference "global.css";

    .record-bar {
        @apply frow-2 items-center h-9 px-3 shrink-0;
        @apply text-sm text-ink-1 border-b border-edge;
        background-color: color-mix(in oklab, var(--color-secondary-500) 8%, var(--color-layer-2));
    }
    :global(.record-icon) {
        @apply size-4 shrink-0 text-secondary-500;
    }
    .record-name {
        @apply flex-1 font-semibold text-ink-0 truncate;
    }
    .back-btn {
        @apply h-7 shrink-0 text-ink-0;
        background-color: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
        &:hover:not(:disabled) { background-color: color-mix(in oklab, var(--color-secondary-500) 28%, transparent); }
    }
</style>
