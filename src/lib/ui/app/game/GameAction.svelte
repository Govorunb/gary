<script lang="ts">
    import { Dices, Send } from "@lucide/svelte";
    import { getUIState } from "$lib/app/utils/di";
    import { JSONSchemaFaker } from "json-schema-faker";
    import CopyButton from "../../common/CopyButton.svelte";
    import CodeMirror from "../../common/CodeMirror.svelte";
    import { parseError, preventDefault, tooltip } from "$lib/app/utils";
    import type { Game, GameAction } from "$lib/api/game.svelte";
    import { boolAttr } from "runed";
    import { EVENT_BUS } from "$lib/app/events/bus";
    import { toast } from "svelte-sonner";

    type Props = {
        action: GameAction;
        game: Game;
    };

    let { action, game }: Props = $props();
    const uiState = getUIState();

    const active = $derived(action.active);

    let open = $state(false);
    let schemaOpen = $state(false);
    const schemaJson = $derived(action.schema && JSON.stringify(action.schema, null, 2));
    const hasSchema = $derived(!!action.schema);

    function send() {
        uiState.dialogs.openManualSendDialog(action, game);
    }

    const evtData = $derived({gameId: game.id, actionName: action.name});

    function doSend(data?: any) {
        EVENT_BUS.emit('ui/game/user_act/send', { ...evtData, hasData: !!data });
        game.manualSend(action.name, data)
            .catch(e => {
                EVENT_BUS.emit('ui/game/user_act/send_error', { ...evtData, error: parseError(e) });
                toast.error(`Failed to send action ${action.name}`, { description: `${e}` });
            });
    }

    function sendRandom() {
        let generatedData: string | undefined;
        if (action.schema) {
            try {
                const genObj = JSONSchemaFaker.generate(action.schema);
                generatedData = JSON.stringify(genObj);
            } catch (e) {
                EVENT_BUS.emit('ui/game/user_act/generate_error', { ...evtData, error: parseError(e) });
                // TODO: popover
                toast.error(`Could not generate random data for ${action.name}`, { description: `${e}` });
                return;
            }
        }
        doSend(generatedData);
    }
</script>

<details class="root accordion group" bind:open data-active={boolAttr(active)}>
    <summary>
        <span>{action.name}</span>
        <div class="actions">
            {#if hasSchema}
                <button
                    class="action-btn"
                    onclick={preventDefault(send)}
                    {@attach tooltip("Send (manual)")}
                >
                    <Send class="size-4" />
                </button>
                <button
                    class="action-btn"
                    onclick={preventDefault(sendRandom)}
                    {@attach tooltip("Send (random data)")}
                >
                    <Dices class="size-4" />
                </button>
            {:else}
                <button
                    class="action-btn"
                    onclick={preventDefault(doSend)}
                    {@attach tooltip("Send")}
                >
                    <Send class="size-4" />
                </button>
            {/if}
        </div>
    </summary>
    <div class="action-description">
        <p>{action.description}</p>
    </div>
    {#if schemaJson}
        <details class="accordion" bind:open={schemaOpen}>
            <summary>
                <span>Schema</span>
                <div class="actions">
                    <CopyButton data={schemaJson} desc="schema" />
                </div>
            </summary>
            <CodeMirror code={schemaJson} open={schemaOpen} readonly />
        </details>
    {/if}
</details>



<style lang="postcss">
    @reference "global.css";

    details.accordion {
        @apply rounded-lg;
        @apply border border-neutral-200/70;
        @apply bg-white/80 shadow-sm transition;
        @apply dark:border-neutral-700 dark:bg-neutral-900/60;
        & > summary {
            @apply frow-2 cursor-pointer items-center justify-between;
            @apply px-4 py-1.5 text-sm font-medium text-neutral-700 transition;
            & > span:first-child {
                @apply flex-1;
            }
            .group:hover &, &:focus-within {
                & > span:first-child {
                    @apply min-w-0 truncate;
                }
            }
            &:hover {
                @apply bg-neutral-100/80 dark:bg-neutral-800/70;
            }
            @apply focus:outline-none;
            &:focus-visible {
                @apply ring-2 ring-sky-400;
            }
            @apply dark:text-neutral-200;
        }
    }

    .actions {
        @apply flex items-center px-1 transition-opacity;
        @apply opacity-0 group-hover:opacity-100 focus-within:opacity-100;
    }

    .action-btn {
        @apply p-1.5 rounded-md transition-colors;
        &:hover {
            @apply bg-neutral-200 dark:bg-surface-700;
            @apply text-neutral-900 dark:text-neutral-100;
        }
    }
    .action-description {
        @apply space-y-2 px-4 pb-4 pt-2;
        @apply text-neutral-600 dark:text-neutral-200;
    }

    .root:not([data-active]) {
        @apply opacity-60;
    }
</style>
