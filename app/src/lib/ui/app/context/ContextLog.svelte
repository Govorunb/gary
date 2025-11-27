<script lang="ts">
    import { SendHorizontal, Volume2, VolumeOff } from "@lucide/svelte";
    import { PressedKeys } from "runed";
    import { untrack } from "svelte";
    import { getSession, getUserPrefs } from "$lib/app/utils/di";
    import { clamp, tooltip } from "$lib/app/utils";
    import OutLink from "$lib/ui/common/OutLink.svelte";
    import TeachingTooltip from "$lib/ui/common/TeachingTooltip.svelte";
    import ContextMessage from "$lib/ui/app/context/ContextMessage.svelte";
    import ContextLogMenu from "$lib/ui/app/context/ContextLogMenu.svelte";

    const session = getSession();
    const userPrefs = getUserPrefs();

    let ctxMenuOpen = $state(false);
    
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
    <div class="flex flex-row gap-4 w-full">
        <ContextLogMenu open={ctxMenuOpen} onOpenChange={(open) => ctxMenuOpen = open} />
        <h2 class="flex-1">Context Log</h2>
        <TeachingTooltip>
            <p>Faded messages are
                <OutLink href="https://github.com/VedalAI/neuro-sdk/blob/main/API/SPECIFICATION.md#parameters-2">
                    silent
                </OutLink>
                .
            </p>
            <p>Click client names to jump to their game tab.</p>
        </TeachingTooltip>
    </div>
    <div class="reverse-log">
        <div class="log" onscroll={logScroll} bind:this={scrollElem}>
            {#each session.context.userView as msg (msg.id)}
                <ContextMessage {msg} />
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
    .input-container {
        @apply flex flex-row gap-1 p-2 rounded-xl shadow-sm;
        @apply bg-neutral-50 dark:bg-neutral-900/70;
        @apply ring-1 ring-primary-200/40 dark:ring-primary-800/40;

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