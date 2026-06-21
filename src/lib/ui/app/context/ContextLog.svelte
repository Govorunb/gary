<script lang="ts">
    import { getSession } from "$lib/app/utils/di";
    import OutLink from "$lib/ui/common/OutLink.svelte";
    import TeachingTooltip from "$lib/ui/common/TeachingTooltip.svelte";
    import ContextMessage from "$lib/ui/app/context/ContextMessage.svelte";
    import ContextLogMenu from "$lib/ui/app/context/ContextLogMenu.svelte";
    import ContextInput from "./ContextInput.svelte";
    import Hotkey from "$lib/ui/common/Hotkey.svelte";
    import VirtualLog from "$lib/ui/common/VirtualLog.svelte";

    const session = getSession();
</script>

<div class="context-log-container">
    <div class="context-log-header frow-4 w-full">
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
        <VirtualLog
            class="h-full"
            items={session.context.userView}
            getKey={(event) => event.id}
            estimateSize={88}
            overscan={10}
        >
            {#snippet children(event)}
                <ContextMessage {event} />
            {/snippet}
        </VirtualLog>
    </div>
    <ContextInput />
</div>

<style lang="postcss">
    @reference "global.css";

    .context-log-container {
        @apply fcol-3 h-full;
        @apply p-2 text-sm shadow-sm;
        @apply bg-neutral-50 dark:bg-neutral-900/70;
        @apply ring-1 ring-primary-200/40 dark:ring-primary-800/40;
    }
    .reverse-log {
        @apply fcol-0 flex-1 min-h-0;
    }
</style>
