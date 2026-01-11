<script lang="ts">
    import { settled, untrack } from "svelte";
    import { getSession } from "$lib/app/utils/di";
    import OutLink from "$lib/ui/common/OutLink.svelte";
    import TeachingTooltip from "$lib/ui/common/TeachingTooltip.svelte";
    import ContextMessage from "$lib/ui/app/context/ContextMessage.svelte";
    import ContextLogMenu from "$lib/ui/app/context/ContextLogMenu.svelte";
    import ContextInput from "./ContextInput.svelte";
    import { ElementSize } from "runed";
    import Hotkey from "$lib/ui/common/Hotkey.svelte";

    const session = getSession();

    let scrollElem: HTMLDivElement | null = $state(null);
    let scrollOffset = $state(0);
    const scrollThreshold = 100;
    const logElemSize = new ElementSize(() => scrollElem);
    let pendingScroll = $state(false);

    // TODO: large perf impact from measuring
    $effect(() => {
        void session.context.userView.length;
        void logElemSize.height;
        untrack(updateScroll);
    });

    function updateScroll() {
        if (!pendingScroll && scrollElem && scrollOffset < scrollThreshold) {
            pendingScroll = true;
            settled().then(() => {
                pendingScroll = false;
                scrollElem!.scrollTop = scrollElem!.scrollHeight;
            });
        }
    }

    function logScroll(event: Event) {
        const target = event.target as HTMLDivElement;
        scrollOffset = target.scrollHeight - target.clientHeight - target.scrollTop;
    }
</script>

<div class="context-log-container">
    <div class="frow-4 w-full">
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
            <p><Hotkey>Alt+C</Hotkey> to focus the input box.</p>
        </TeachingTooltip>
    </div>
    <div class="reverse-log">
        <div class="log" onscroll={logScroll} bind:this={scrollElem}>
            <!-- TODO: https://tanstack.com/virtual/latest/docs/introduction -->
            {#each session.context.userView as msg (msg.id)}
                <ContextMessage {msg} />
            {/each}
        </div>
    </div>
    <ContextInput />
</div>

<style lang="postcss">
    @reference "global.css";

    .context-log-container {
        @apply fcol-4 h-full;
        @apply p-4 text-sm shadow-sm;
        @apply bg-neutral-50 dark:bg-neutral-900/70;
        @apply ring-1 ring-primary-200/40 dark:ring-primary-800/40;
    }
    .reverse-log {
        @apply flex flex-col flex-1 min-h-0;
    }
    .log {
        @apply fcol-scroll-2 h-full;
    }
</style>
