<script lang="ts">
    import { getSession } from "$lib/app/utils/di";
    import type { MessageSource } from "$lib/app/context.svelte";
    import { EllipsisVertical, Trash } from "@lucide/svelte";
    import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';

    let session = getSession();
    let popoverOpen = $state(false);

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
    function clickClearContext() {
        session.context.clear();
        popoverOpen = false;
    }
</script>

<div class="flex flex-col gap-2">
    <div class="flex items-center gap-4">
        <Popover modal open={popoverOpen} onOpenChange={(d) => popoverOpen = d.open}>
            <Popover.Trigger class="menu-trigger"
                    title="Menu" aria-label="Menu"
            >
                <EllipsisVertical />
            </Popover.Trigger>
            <Portal>
                <Popover.Positioner class="z-20!">
                    <Popover.Content>
                        <div class="menu-content">
                            <button 
                                class="clear-button"
                                onclick={clickClearContext}
                            >
                                <Trash size="14" /> Clear Context
                            </button>
                        </div>
                    </Popover.Content>
                </Popover.Positioner>
            </Portal>
        </Popover>
        <h2>Context Log</h2>
    </div>
    <!-- TODO: scrolling log component ($effect() to scroll to bottom unless manually scrolled up, etc.) -->
    <div class="reverse-log"> <!-- instead of reversing the array -->
        <div class="log">
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
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";

    h2 {
        @apply text-2xl font-bold text-neutral-800 dark:text-neutral-50;
    }
    .reverse-log {
        @apply flex flex-col-reverse;
    }
    .log {
        @apply flex flex-col gap-2 p-4 rounded-xl text-sm shadow-sm
            h-full max-h-[calc(100vh-11rem)] overflow-scroll
            bg-neutral-50 ring-1 ring-primary-200/40
            dark:bg-neutral-900/70 dark:ring-primary-800/40;
    }
    .menu-trigger {
        @apply p-2 rounded-md bg-neutral-50 text-neutral-700
            dark:bg-neutral-900/30 dark:text-neutral-300
            transition-colors;
        &:hover {
            @apply bg-neutral-100 dark:bg-neutral-800/50;
        }
    }
    .menu-content {
        @apply bg-surface-200-800/85 p-2 rounded-lg border-2 border-neutral-900/30 min-w-48;
    }
    .clear-button {
        @apply w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md
            border border-red-300 bg-red-50 text-red-700
            dark:border-red-700 dark:bg-red-900/30 dark:text-red-300
            transition-colors text-left;
        &:hover {
            @apply bg-red-100 dark:bg-red-900/50;
        }
    }
    .message {
        @apply grid grid-cols-[auto_auto_auto_1fr] gap-2 items-center rounded-lg border px-3 py-2 transition wrap-anywhere;
        @apply border-red-400/40 border-dotted; /* invalid source fallback */
        &:hover {
            @apply bg-neutral-100/70 dark:bg-neutral-800/60;
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