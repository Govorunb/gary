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

<button class="icon-btn copy-button"
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

    .copy-button[data-copied] {
        @apply text-lvl-ok;
    }
</style>
