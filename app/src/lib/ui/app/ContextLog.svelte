<script lang="ts">
    import { getSession, getUIState, getUserPrefs } from "$lib/app/utils/di";
    import type { MessageSource } from "$lib/app/context.svelte";
    import { EllipsisVertical, SendHorizontal, Volume2, VolumeOff } from "@lucide/svelte";
    import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
    import { PressedKeys } from "runed";
    import { clamp, tooltip } from "$lib/app/utils";
    import { untrack } from "svelte";

    const session = getSession();
    const userPrefs = getUserPrefs();
    const uiState = getUIState();

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

    let ctxMenuOpen = $state(false);
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
    
    const keys = new PressedKeys();
    const shiftPressed = $derived(keys.has("Shift"));
    keys.onKeys(["Control", "Enter"], submit);

    let userInput = $state("");
    let silent = $derived(userPrefs.app.ctxInputSilent !== shiftPressed);
    
    let textareaElem: HTMLTextAreaElement | null = $state(null);
    // FIXME: long text with no line breaks doesn't expand
    const textareaLines = $derived(clamp(userInput.split("\n").length, 1, 5));
    
    function submit() {
        if (!userInput) return;
        session.context.user({text: userInput, silent});
        userInput = "";
    }
    
    function toggleSilent() {
        userPrefs.app.ctxInputSilent = !userPrefs.app.ctxInputSilent;
    }

    $effect(() => {
        void session.context.userView.length;
        void textareaLines;
        untrack(updateScroll);
    });
    
    function updateScroll() {
        if (scrollElem && scrollOffset < scrollThreshold) {
            scrollElem.scrollTop = scrollElem.scrollHeight;
        }
    }

    function logScroll(event: Event) {
        const target = event.target as HTMLDivElement;
        scrollOffset = target.scrollHeight - target.clientHeight - target.scrollTop;
    }
</script>

<div class="container">
    <div class="flex flex-row gap-4">
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
                            <!-- TODO: reset instead of clear (add sys prompt first) -->
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
                <div class={["message", msg.source.type]}
                    class:silent={msg.silent}
                >
                    <!-- TODO: put icon in corner (real estate) -->
                    <!-- TODO: more icons (silent, ephemeral, etc) in one or more corners -->
                    <span class="message-timestamp"
                        {@attach tooltip(msg.timestamp.toString())}
                    >
                        {msg.timestamp.toLocaleTimeString()}
                    </span>
                    <span class="message-icon"
                        {@attach tooltip(msg.source.type)}
                    >
                        {getSourceIcon(msg.source)}
                    </span>
                    {#if msg.source.type === 'client'}
                        <button class=""
                            onclick={() => uiState.selectGameTab((msg.source.type === 'client' && msg.source.id) as string)}
                            title="ID: {msg.source.id}"
                        >
                            <span class="client-name">{msg.source.name}:</span>
                        </button>
                    {/if}
                    <span class="message-text">{msg.text}</span>
                </div>
            {/each}
        </div>
    </div>
    <div class="input-container">
        <textarea 
            bind:value={userInput}
            bind:this={textareaElem}
            placeholder="Add to context"
            class="input-field"
            rows={textareaLines}
        ></textarea>
        <button
            class="silent-btn"
            {@attach tooltip("Toggle silent (hold Shift to invert)")}
            onclick={toggleSilent}
        >
            {#if silent}
                <VolumeOff />
            {:else}
                <Volume2 />
            {/if}
        </button>
        <button 
            class="send-button"
            onclick={submit}
            disabled={!userInput}
            {@attach tooltip("Send (Ctrl+Enter)")}
        >
            <SendHorizontal />
        </button>
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    h2 {
        @apply text-2xl font-bold text-neutral-800 dark:text-neutral-50;
    }
    .container {
        @apply flex flex-col h-full gap-4;
        @apply p-4 rounded-xl text-sm shadow-sm;
        @apply bg-neutral-50 ring-1 ring-primary-200/40;
        @apply dark:bg-neutral-900/70 dark:ring-primary-800/40;
    }
    .reverse-log {
        /* flex-col-reverse instead of reversing the array */
        @apply flex flex-col-reverse flex-1 min-h-0;
    }
    .log {
        @apply flex flex-col gap-2;
        @apply h-full overflow-scroll;
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
        @apply rounded-lg border px-3 py-2 wrap-anywhere;
        @apply border-red-400/40; /* invalid source fallback */
        @apply border-dotted hover:border-solid;
        @apply transition-all;
        &.system {
            @apply bg-amber-400/5;
            @apply border-amber-400/70;
        }
        &.client {
            @apply bg-sky-400/5;
            @apply border-sky-400/70;
        }
        &.user {
            @apply bg-emerald-400/5;
            @apply border-emerald-400/70;
        }
        &.actor {
            @apply bg-purple-400/5;
            @apply border-purple-400/70;
        }
        &.silent {
            @apply opacity-70 dark:opacity-60 hover:opacity-100;
        }
    }
    .message-icon {
        @apply text-lg cursor-default;
    }
    .message-timestamp {
        @apply text-xs text-neutral-500 dark:text-neutral-400 cursor-default;
    }
    .message-text {
        @apply whitespace-pre-wrap text-neutral-700 dark:text-neutral-100;
    }
    .client-name {
        @apply font-semibold text-neutral-700 dark:text-neutral-100;
    }
    .input-container {
        @apply flex flex-row gap-1 p-3 rounded-xl;
        @apply bg-neutral-50 ring-1 ring-primary-200/40 shadow-sm;
        @apply dark:bg-neutral-900/70 dark:ring-primary-800/40;

        & button {
            @apply self-center px-4 py-2 rounded-md transition-all;
        }
    }
    .input-field {
        @apply flex-1 resize-none rounded-md px-3 py-2 text-sm;
        @apply bg-white border border-neutral-300;
        @apply dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-100;
        @apply focus:outline-none focus:ring-2 focus:ring-primary-500;
    }
    .silent-btn {
        @apply rounded-md transition-colors;
        @apply opacity-70;
        &:hover {
            @apply bg-neutral-200 dark:bg-surface-700;
            @apply text-neutral-900 dark:text-neutral-100;
            @apply opacity-100;
        }
    }
    .send-button {
        @apply bg-primary-500 dark:bg-primary-700;
        @apply text-primary-contrast-500 dark:text-primary-contrast-700;
        &:hover:not(:disabled) {
            @apply bg-primary-400 dark:bg-primary-800;
        }
    }
</style>