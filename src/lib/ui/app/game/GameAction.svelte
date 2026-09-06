<script lang="ts">
    import { Dices, Send } from "@lucide/svelte";
    import { getScheduler, getUIState, getUserPrefs } from "$lib/app/utils/di";
    import CopyButton from "../../common/CopyButton.svelte";
    import CodeMirror from "../../common/CodeMirror.svelte";
    import { generateFromJsonSchema, parseError, preventDefault, tooltip } from "$lib/app/utils";
    import type { Game, GameAction } from "$lib/api/game.svelte";
    import { boolAttr } from "runed";
    import { EVENT_BUS } from "$lib/app/events/bus";
    import type { JsonSchema } from "json-schema-faker";

    type Props = {
        action: GameAction;
        game: Game;
    };

    let { action, game }: Props = $props();
    const uiState = getUIState();
    const userPrefs = getUserPrefs();
    const scheduler = getScheduler();

    const active = $derived(action.active);
    const busy = $derived(scheduler.busy);
    const busyTip = (tip: string) => tooltip(busy ? "Engine busy (Shift to stop)" : tip);

    let open = $state(false);
    const schemaJson = $derived(action.schema && JSON.stringify(action.schema, null, 2));
    const hasSchema = $derived(!!action.schema);

    function send() {
        uiState.dialogs.openManualSendDialog(action, game);
    }

    const evtData = $derived({gameId: game.id, actionName: action.name});
    function doSend(data?: string) {
        EVENT_BUS.emit('ui/game/user_act/send', { ...evtData, hasData: !!data });
        game.manualSend(action.name, data)
            .catch(e => {
                EVENT_BUS.emit('ui/game/user_act/send_error', { ...evtData, error: parseError(e) });
            });
    }

    async function sendRandom() {
        let generatedData: string | undefined;
        if (action.schema) {
            try {
                const genObj = await generateFromJsonSchema(action.schema as JsonSchema);
                generatedData = JSON.stringify(genObj);
            } catch (e) {
                EVENT_BUS.emit('ui/game/user_act/generate_error', { ...evtData, error: parseError(e) });
                // TODO: popover
                return;
            }
        }
        doSend(generatedData);
    }

    function quickSend(evt: MouseEvent) {
        if (evt.defaultPrevented || !(evt.ctrlKey || evt.metaKey)) return;
        evt.preventDefault();
        if (busy) return;
        if (hasSchema) {
            send();
        } else {
            doSend();
        }
    }
</script>

<details
    class="action group"
    bind:open
    data-active={boolAttr(active)}
    data-compact={boolAttr(userPrefs.app.actionListDensity === "compact")}
>
    <summary onclick={quickSend}>
        <span class="name">{action.name}</span>
        <div class="row-actions">
            {#if hasSchema}
                <button
                    class="icon-btn"
                    disabled={busy}
                    onclick={preventDefault(send)}
                    {@attach busyTip("Send (manual) - Ctrl/Cmd-click row")}
                >
                    <Send />
                </button>
                <button
                    class="icon-btn"
                    disabled={busy}
                    onclick={preventDefault(sendRandom)}
                    {@attach busyTip("Send (random data)")}
                >
                    <Dices />
                </button>
            {:else}
                <button
                    class="icon-btn"
                    disabled={busy}
                    onclick={preventDefault(() => doSend())}
                    {@attach busyTip("Send - Ctrl/Cmd-click row")}
                >
                    <Send />
                </button>
            {/if}
        </div>
    </summary>
    <div class="body">
        {#if action.description}
            <p class="description">{action.description}</p>
        {/if}
        {#if schemaJson}
            <div class="schema">
                <div class="schema-header">
                    <span>Schema</span>
                    <CopyButton data={schemaJson} desc="schema" />
                </div>
                <CodeMirror code={schemaJson} {open} readonly />
            </div>
        {/if}
    </div>
</details>

<style lang="postcss">
    @reference "global.css";

    details.action {
        @apply rounded-md transition-colors;
        &[open] {
            @apply bg-layer-2;
        }
        &:not([data-active]) {
            @apply opacity-60;
        }
        & > summary {
            @apply frow-2 cursor-pointer items-center h-7 pl-2 pr-1 rounded-md;
            @apply text-sm text-ink-1 select-none;
            list-style: none;
            &::-webkit-details-marker { display: none; }
            &:hover {
                @apply bg-layer-2 text-ink-0;
            }
            &:focus-visible {
                @apply outline-none ring-2 ring-inset ring-accent;
            }
        }
        &[open] > summary {
            @apply text-ink-0;
        }
        &[data-compact] > summary {
            @apply h-6;
        }
    }
    .name {
        @apply flex-1 min-w-0 truncate;
    }
    .row-actions {
        @apply frow-0 items-center shrink-0 transition-opacity;
        @apply opacity-0 group-hover:opacity-100 focus-within:opacity-100;
        details[open] & { @apply opacity-100; }
        & :global(.icon-btn) { @apply size-6; }
    }
    .body {
        @apply fcol-2 px-2 pb-2 pt-0.5;
    }
    .description {
        @apply text-xs text-ink-2 whitespace-pre-wrap;
    }
    .schema {
        @apply fcol-1;
    }
    .schema-header {
        @apply frow-2 items-center justify-between;
        @apply text-xs font-semibold text-ink-3 select-none;
    }
</style>
