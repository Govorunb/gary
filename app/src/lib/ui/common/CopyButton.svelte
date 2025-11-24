<script lang="ts">
    import { Check, Clipboard } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { boolAttr } from "runed";
    import { preventDefault, tooltip } from "$lib/app/utils";


    type Props = {
        data: string;
        desc?: string;
        iconSize?: number;
        showToast?: boolean;
    }

    let {
        data,
        desc,
        iconSize = 14,
        showToast = true
    }: Props = $props();
    const feedbackDuration = $state(2000);
    const description = $derived(desc ? ` ${desc}` : "");
    
    let copied = $state(false);
    $effect(() => {
        if (copied) {
            setTimeout(() => copied = false, feedbackDuration);
        }
    })
    function copy() {
        if (copied) return;
        window.navigator.clipboard.writeText(data);
        copied = true;
        if (showToast) toast.success(`Copied${description} to clipboard`, { duration: feedbackDuration });
    }
</script>

<button class="copy-button"
    onclick={preventDefault(copy)}
    data-copied={boolAttr(copied)}
    {@attach tooltip(`Copy${description}`)}
>
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
        @apply text-neutral-700 dark:text-neutral-200;
        @apply transition-colors duration-150;

        &:hover {
            @apply bg-neutral-200 dark:bg-surface-700;
            @apply text-neutral-900 dark:text-neutral-50;
        }
        
        &:focus-visible {
            @apply outline-none ring-2 ring-sky-400;
        }
    
        &[data-copied] {
            @apply bg-primary-200/50 dark:bg-primary-700/50 text-white;
        }
    }
</style>