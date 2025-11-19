<script lang="ts">
    import { Check, Clipboard } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { boolAttr } from "runed";


    type Props = {
        data: string;
        iconSize?: number;
        showToast?: boolean;
    }

    let { data, iconSize = 12, showToast = true }: Props = $props();
    const feedbackDuration = $state(2000);
    
    let copied = $state(false);
    $effect(() => {
        if (copied) {
            setTimeout(() => copied = false, feedbackDuration);
        }
    })
    function copyID() {
        if (copied) return;
        window.navigator.clipboard.writeText(data);
        copied = true;
        if (showToast) toast.success("Copied to clipboard", { duration: feedbackDuration });
    }
</script>

<button class="copy-button" title="Copy" aria-label="Copy" onclick={copyID} data-copied={boolAttr(copied)}>
    {#if copied}
        <Check size={iconSize} />
    {:else}
        <Clipboard size={iconSize} />
    {/if}
</button>

<style lang="postcss">
    @reference "global.css";

    .copy-button {
        @apply p-1.5 rounded-md shrink-0;
        @apply bg-neutral-200 text-neutral-700;
        @apply dark:bg-neutral-700 dark:text-neutral-300;
        @apply transition-colors duration-150;
        
        &:hover {
            @apply bg-neutral-300;
            @apply dark:bg-neutral-600;
        }
        
        &:focus-visible {
            @apply outline-none ring-2 ring-sky-400;
        }
    
        &[data-copied] {
            @apply bg-primary-200/50 dark:bg-primary-700/50 text-white;
        }
    }
</style>