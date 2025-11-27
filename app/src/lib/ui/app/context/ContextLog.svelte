<script lang="ts">
    import { untrack } from "svelte";
    import { getSession } from "$lib/app/utils/di";
    import OutLink from "$lib/ui/common/OutLink.svelte";
    import TeachingTooltip from "$lib/ui/common/TeachingTooltip.svelte";
    import ContextMessage from "$lib/ui/app/context/ContextMessage.svelte";
    import ContextLogMenu from "$lib/ui/app/context/ContextLogMenu.svelte";
    import ContextInput from "./ContextInput.svelte";
    import { ElementSize } from "runed";

    const session = getSession();

    let scrollElem: HTMLDivElement | null = $state(null);
    let scrollOffset = $state(0);
    const scrollThreshold = 100;
    const logElemSize = new ElementSize(() => scrollElem);

    $effect(() => {
        void session.context.userView.length;
        void logElemSize.height;
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
        <ContextLogMenu />
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
    <ContextInput />
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
</style>
