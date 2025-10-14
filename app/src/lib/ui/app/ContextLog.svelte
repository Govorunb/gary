<script lang="ts">
    import { injectAssert } from "$lib/app/utils/di";
    import { SESSION, type Session } from "$lib/app/session.svelte";
    import type { Message, Source } from "$lib/app/context.svelte";

    let session = injectAssert<Session>(SESSION);

    function getSourceIcon(source: Source): string {
        switch (source.type) {
            case "system":
                return "⚙️";
            case "client":
                return "🎮";
            case "user":
                return "👤";
            case "actor":
                // TODO: mark manual 'actor' acts (tony)
                return "🤖";
            default:
                return "";
        }
    }
</script>

<!-- TODO: scrolling log -->
<div class="context-log-container">
    <h2>Context Log</h2>
    <!-- TODO: this should render as a grid (currently long messages will break the timestamp into two lines, misaligning everything) -->
    {#each session.context.userView as msg (msg.id)}
        <div class={['message', `source-${msg.source.type}`]}>
            <span class="icon">{getSourceIcon(msg.source)}</span>
            <span class="timestamp">{msg.timestamp.toLocaleTimeString()}</span>
            {#if msg.source.type === 'client'}
                <span class="source-name">{msg.source.name}:</span>
            {/if}
            <span class="text">{msg.text}</span>
        </div>
    {/each}
</div>

<style>
    .context-log-container {
        border: 1px solid #ccc;
        height: 100%;
        padding: 0.5rem;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }

    .message {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        &:hover {
            &.source-system {
                background-color: light-dark(#f0f0f0, #00000058);
            }
            &.source-client {
                background-color: light-dark(#f0f0f0, #00000058);
            }
            &.source-user {
                background-color: light-dark(#f0f0f0, #00000058);
            }
            &.source-actor {
                background-color: light-dark(#f0f0f0, #00000058);
            }
        }
        cursor: pointer;
    }

    .icon {
        font-size: 1.2rem;
    }

    .timestamp {
        font-size: 0.8rem;
        color: #666;
    }

    .source-name {
        font-weight: bold;
    }

    .text {
        white-space: pre-wrap;
    }
</style>
