<script lang="ts">
    import type { Message } from "$lib/app/context.svelte";
    import { getRegistry, getUIState } from "$lib/app/utils/di";
    import { tooltip } from "$lib/app/utils";
    import { boolAttr } from "runed";
    import dayjs from "dayjs";

    interface Props {
        msg: Message;
    }

    const { msg }: Props = $props();

    const timestamp = $derived(dayjs(msg.timestamp));
    
    const registry = getRegistry();
    const uiState = getUIState();

    function getSourceIcon(msg: Message): string {
        switch (msg.source.type) {
            case "system":
                return "⚙️";
            case "client":
                return "🎮";
            case "user":
                return "👤";
            case "actor":
                return msg.source.manual ? "👤" : "🤖";
            default:
                return "❓";
        }
    }
</script>

<div class={["message", msg.source.type]}
    class:silent={msg.silent === true /* boolean | "noAct" */}
>
    <span class="message-icon"
        {@attach tooltip(msg.source.type)}
    >
        {getSourceIcon(msg)}
    </span>
    <div class="message-content">
        <div class="message-header">
            <span class="message-timestamp"
                {@attach tooltip(timestamp.toString())}
            >
                {timestamp.format("LTS")}
            </span>
            {#if msg.source.type === 'client'}
                <button class="client-name"
                    tabindex="-1"
                    data-gone={boolAttr(msg.source.type === 'client' && !registry.getGame(msg.source.id))}
                    onclick={() => uiState.selectGameTab((msg.source.type === 'client' && msg.source.id) as string)}
                    title="ID: {msg.source.id}"
                >
                    {msg.source.name}
                </button>
            {/if}
        </div>
        <span class="message-text">{msg.text}</span>
    </div>
</div>

<style lang="postcss">
    @reference "global.css";

    .message {
        @apply relative rounded-lg border px-3 py-2 wrap-anywhere;
        @apply border-dotted hover:border-solid;
        @apply transition-all;
        &.system {
            @apply bg-amber-400/5 border-amber-400/70;
            & .message-icon {
                @apply bg-amber-200 dark:bg-amber-800/50;
            }
        }
        &.client {
            @apply bg-sky-400/5 border-sky-400/70;
            & .message-icon {
                @apply bg-sky-200 dark:bg-sky-800/50;
            }
        }
        &.user {
            @apply bg-emerald-400/5 border-emerald-400/70;
            & .message-icon {
                @apply bg-emerald-200 dark:bg-emerald-800/50;
            }
        }
        &.actor {
            @apply bg-purple-400/5 border-purple-400/70;
            & .message-icon {
                @apply bg-purple-200 dark:bg-purple-800/50;
            }
        }
        &.silent {
            @apply opacity-70 dark:opacity-60 hover:opacity-100;
        }
    }
    .message-icon {
        @apply absolute inset-0 size-6;
        @apply flex items-center justify-center;
        @apply rounded-br-lg rounded-tl-lg cursor-default;
    }
    .message-timestamp {
        @apply text-xs text-neutral-500 dark:text-neutral-400 cursor-default;
    }
    .message-content {
        @apply flex flex-col gap-1 ml-6;
    }
    .message-header {
        @apply flex items-center gap-2;
    }
    .message-text {
        @apply whitespace-pre-wrap text-neutral-700 dark:text-neutral-100;
    }
    .client-name {
        @apply font-semibold text-neutral-700 dark:text-neutral-100;
        &[data-gone] {
            @apply line-through opacity-60 cursor-default;
        }
    }
</style>
