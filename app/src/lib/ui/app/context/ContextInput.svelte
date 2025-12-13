<script lang="ts">
    import { SendHorizontal, Volume2, VolumeOff } from "@lucide/svelte";
    import { PressedKeys, TextareaAutosize } from "runed";
    import { tooltip } from "$lib/app/utils";
    import { getSession, getUserPrefs } from "$lib/app/utils/di";

    const session = getSession();
    const userPrefs = getUserPrefs();

    const keys = new PressedKeys();
    const shiftPressed = $derived(keys.has("Shift"));
    keys.onKeys(["Control", "Enter"], submit);
    keys.onKeys(["Alt", "C"], () => textareaElem?.focus());

    let value = $state("");
    const silent = $derived(userPrefs.app.ctxInputSilent !== shiftPressed);

    let textareaElem = $state<HTMLTextAreaElement>();
    new TextareaAutosize({
        element: () => textareaElem,
        input: () => value,
        maxHeight: 100, // hack but the 'right' way (multiple of line-height) isn't obvious rn
    });

    function submit() {
        if (!value) return;
        session.context.user({text: value, silent});
        value = "";
    }

    function toggleSilent() {
        userPrefs.app.ctxInputSilent = !userPrefs.app.ctxInputSilent;
    }
</script>

<div class="input-container">
    <textarea
        bind:value
        bind:this={textareaElem}
        placeholder="Add to context"
        class="input-field"
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
        disabled={!value}
        {@attach tooltip("Send (Ctrl+Enter)")}
    >
        <SendHorizontal />
    </button>
</div>

<style lang="postcss">
    @reference "global.css";

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
