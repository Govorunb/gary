<script lang="ts">
    import { getSession } from "$lib/app/utils/di";
    import type { MessageSource } from "$lib/app/context.svelte";
    import { EllipsisVertical } from "@lucide/svelte";
    import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';

    let session = getSession();
    let ctxMenuOpen = $state(false);

    function getSourceIcon(source: MessageSource): string {
        switch (source.type) {
            case "system":
                return "⚙️";
            case "client":
                return "🎮";
            case "user":
                return "👤";
            case "actor":
                // TODO: mark manual 'actor' acts (tony)
                return "🤖";
            default:
                return "";
        }
    }
    function closeMenu() {
        ctxMenuOpen = false;
    }
    function clearContext() {
        session.context.clear();
        closeMenu();
    }
    function copyContext() {
        navigator.clipboard.writeText(JSON.stringify(session.context.userView));
        closeMenu();
    }
    
    let scrollElem: HTMLDivElement | null = $state(null);
    let scrollOffset = $state(0);
    const scrollThreshold = 100;

    $effect(() => {
        void session.context.userView.length;
        if (scrollElem && scrollOffset < scrollThreshold) {
            scrollElem.scrollTop = scrollElem.scrollHeight;
        }
    });

    function logScroll(event: Event) {
        const target = event.target as HTMLDivElement;
        scrollOffset = target.scrollHeight - target.clientHeight - target.scrollTop;
    }
</script>

<div class="flex flex-col gap-2 h-full">
    <div class="flex items-center gap-4">
        <Popover modal open={ctxMenuOpen} onOpenChange={(d) => ctxMenuOpen = d.open}>
            <Popover.Trigger class="menu-trigger"
                    title="Menu" aria-label="Menu"
            >
                <EllipsisVertical />
            </Popover.Trigger>
            <Portal>
                <Popover.Positioner class="z-20!">
                    <Popover.Content>
                        <div class="menu-content">
                            <button class="btn preset-tonal-surface" onclick={copyContext}>
                                Copy as JSON
                            </button>
                            <button class="btn preset-filled-error-500" onclick={clearContext}>
                                Clear Context
                            </button>
                        </div>
                    </Popover.Content>
                </Popover.Positioner>
            </Portal>
        </Popover>
        <h2>Context Log</h2>
    </div>
    <div class="reverse-log">
        <div class="log" onscroll={logScroll} bind:this={scrollElem}>
            {#each session.context.userView as msg (msg.id)}
                <div class="message {msg.source.type}">
                    <!-- TODO: put icon in corner (real estate) -->
                    <!-- TODO: more icons (silent, ephemeral, etc) in one or more corners -->
                    <span class="message-icon">{getSourceIcon(msg.source)}</span>
                    <span class="message-timestamp">{msg.timestamp.toLocaleTimeString()}</span>
                    <span class="message-text">
                        <!-- TODO: click to focus that game's tab -->
                        {#if msg.source.type === 'client'}
                            <span class="client-name">{msg.source.name}:</span>
                        {/if}
                        {msg.text}
                    </span>
                </div>
            {/each}
        </div>
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    h2 {
        @apply text-2xl font-bold text-neutral-800 dark:text-neutral-50;
    }
    .reverse-log {
        /* flex-col-reverse instead of reversing the array */
        @apply flex flex-col-reverse h-full;
    }
    .log {
        @apply flex flex-col gap-2 p-4 rounded-xl text-sm shadow-sm;
        @apply h-full max-h-[calc(100vh-9rem)] overflow-scroll;
        @apply bg-neutral-50 ring-1 ring-primary-200/40;
        @apply dark:bg-neutral-900/70 dark:ring-primary-800/40;
    }
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
    .clear-button {
        @apply w-full flex items-center gap-2 px-3 py-2 text-sm;
        @apply border border-red-300 bg-red-50 text-red-700;
        @apply dark:border-red-700 dark:bg-red-900/30 dark:text-red-300;
        @apply transition-colors text-left;
        &:hover {
            @apply bg-red-100;
            @apply dark:bg-red-900/50;
        }
    }
    .message {
        @apply grid grid-cols-[auto_auto_auto_1fr] gap-2 items-center;
        @apply rounded-lg border px-3 py-2 transition wrap-anywhere;
        @apply border-red-400/40 border-dotted; /* invalid source fallback */
        &:hover {
            @apply bg-neutral-100/70;
            @apply dark:bg-neutral-800/60;
        }
        &.system {
            @apply border-amber-400/40;
        }
        &.client {
            @apply border-sky-400/40;
        }
        &.user {
            @apply border-emerald-400/40;
        }
        &.actor {
            @apply border-purple-400/40;
        }
    }
    .message-icon {
        @apply text-lg;
    }
    .message-timestamp {
        @apply text-xs text-neutral-500 dark:text-neutral-400;
    }
    .message-text {
        @apply whitespace-pre-wrap text-neutral-700 dark:text-neutral-100;
    }
    .client-name {
        @apply font-semibold text-neutral-700 dark:text-neutral-100;
    }
</style>