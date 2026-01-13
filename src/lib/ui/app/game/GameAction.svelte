<script lang="ts">
    import { Dices, Send } from "@lucide/svelte";
    import { getSession, getUIState } from "$lib/app/utils/di";
    import { JSONSchemaFaker } from "json-schema-faker";
    import { zAct, zActData } from "$lib/api/v1/spec";
    import r from "$lib/app/utils/reporting";
    import CopyButton from "../../common/CopyButton.svelte";
    import CodeMirror from "../../common/CodeMirror.svelte";
    import { preventDefault, tooltip } from "$lib/app/utils";
    import type { Game, GameAction } from "$lib/api/game.svelte";
    import { boolAttr } from "runed";

    type Props = {
        action: GameAction;
        game: Game;
    };

    let { action, game }: Props = $props();
    const session = getSession();
    const uiState = getUIState();

    const active = $derived(action.active);

    let open = $state(false);
    let schemaOpen = $state(false);
    const schemaJson = $derived(action.schema && JSON.stringify(action.schema, null, 2));
    const hasSchema = $derived(!!action.schema);

    function send() {
        uiState.dialogs.openManualSendDialog(action, game);
    }

    function sendImmediate() {
        game.manualSend(action.name, undefined)
            .catch(e => r.error(`Failed to send action ${action.name}`, `${e}`));
    }

    function sendRandom() {
        let generatedData: string | undefined;
        if (action.schema) {
            try {
                const genObj = JSONSchemaFaker.generate(action.schema);
                generatedData = JSON.stringify(genObj);
            } catch (e) {
                r.error(`Failed to generate random data for ${action.name}`, `${e}`);
                return;
            }
        }
        game.manualSend(action.name, generatedData)
            .catch(e => r.error(`Failed to send action ${action.name}`, `${e}`));
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
                    onclick={preventDefault(sendImmediate)}
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
