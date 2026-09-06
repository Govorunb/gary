<script lang="ts">
    import { Flag, FlagOff, SendHorizontal, MessageSquare } from "@lucide/svelte";
    import { PressedKeys, TextareaAutosize } from "runed";
    import { tick } from "svelte";
    import { tooltip } from "$lib/app/utils";
    import { getUserPrefs } from "$lib/app/utils/di";
    import { EVENT_BUS } from "$lib/app/events/bus";
    import TeachingTooltip from "$lib/ui/common/TeachingTooltip.svelte";
    import Hotkey from "$lib/ui/common/Hotkey.svelte";

    const userPrefs = getUserPrefs();
    const keys = new PressedKeys();
    const shiftPressed = $derived(keys.has("Shift"));

    keys.onKeys(["Alt", "C"], () => open());

    let expanded = $state(false);
    let value = $state("");
    const silent = $derived(userPrefs.app.ctxInputSilent !== shiftPressed);
    let textareaElem = $state<HTMLTextAreaElement>();

    new TextareaAutosize({
        element: () => textareaElem,
        input: () => value,
        maxHeight: 130, // about six lines
    });

    async function open() {
        expanded = true;
        await tick();
        textareaElem?.focus();
    }

    function close() {
        expanded = false;
    }

    function submit() {
        if (!value) return;
        EVENT_BUS.emit('ui/context/input', { text: value, silent });
        value = "";
        close();
    }

    function toggleSilent() {
        userPrefs.app.ctxInputSilent = !userPrefs.app.ctxInputSilent;
    }

    function onKeydown(evt: KeyboardEvent) {
        if (evt.ctrlKey && evt.key === "Enter") {
            evt.preventDefault();
            submit();
        }
        if (evt.key === "Escape") {
            evt.preventDefault();
            close();
        }
    }

    let container = $state<HTMLDivElement>();
    function onFocusOut(evt: FocusEvent) {
        // Focus moving to the silent toggle or send button stays inside; anywhere else counts as leaving.
        const next = evt.relatedTarget as Node | null;
        if (next && container?.contains(next)) return;
        if (!value) close();
    }
</script>

{#if expanded}
    <div class="input-container" bind:this={container} onfocusout={onFocusOut}>
        <textarea
            bind:value
            bind:this={textareaElem}
            placeholder="Add to context"
            class="input-field"
            rows="1"
            onkeydown={onKeydown}
        ></textarea>
        <div class="tools">
            <button
                class="icon-btn"
                {@attach tooltip("Toggle silent (hold Shift to invert)")}
                onclick={toggleSilent}
            >
                {#if silent}
                    <FlagOff />
                {:else}
                    <Flag />
                {/if}
            </button>
            <TeachingTooltip>
                <p><Hotkey>Ctrl+Enter</Hotkey> send</p>
                <p><Hotkey>Esc</Hotkey> close</p>
                <p>Hold <Hotkey>Shift</Hotkey> to invert silent for one message</p>
            </TeachingTooltip>
            <button
                class="send-button"
                onclick={submit}
                disabled={!value}
                {@attach tooltip("Send (Ctrl+Enter)")}
            >
                <SendHorizontal />
            </button>
        </div>
    </div>
{:else}
    <div class="collapsed">
        <button class="open-link" onclick={open}>
            <MessageSquare />
            <span>Add to context</span>
            <Hotkey>Alt+C</Hotkey>
        </button>
    </div>
{/if}

<style lang="postcss">
    @reference "global.css";

    .collapsed {
        @apply flex justify-end shrink-0 px-2.5 py-2;
    }
    .open-link {
        @apply frow-1.5 items-center h-7 px-2 rounded-md;
        @apply text-xs text-ink-2 transition-colors;
        & > :global(svg) { @apply size-3.5; }
        &:hover { @apply text-ink-0 bg-layer-2; }
        &:focus-visible { @apply outline-none ring-2 ring-accent; }
    }
    .input-container {
        @apply frow-1 items-end shrink-0 m-2.5 mt-1.5 p-1 rounded-lg;
        @apply bg-layer-2 ring-[1.5px] ring-accent;
    }
    .input-field {
        @apply flex-1 resize-none px-2 py-1.5 text-sm bg-transparent text-ink-0;
        @apply placeholder:text-ink-3 outline-none;
    }
    /* Same height as one textarea line so the icons center on it, and on the last line once the box grows. */
    .tools {
        @apply frow-0.5 items-center shrink-0 h-8;
        & :global(.teaching-tooltip-trigger) {
            @apply inline-flex items-center justify-center size-7 rounded-md text-ink-3;
            &:hover { @apply text-ink-1; }
            & > :global(svg) { @apply size-4; }
        }
    }
    .send-button {
        @apply inline-flex items-center justify-center size-7 rounded-md ml-0.5;
        @apply bg-accent text-white transition;
        & > :global(svg) { @apply size-4; }
        &:hover:not(:disabled) { filter: brightness(1.1); }
        &:disabled { @apply opacity-40 cursor-not-allowed; }
    }
</style>
