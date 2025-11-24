<script lang="ts">
    import type { Action } from "$lib/api/v1/spec";
    import { basicSetup, EditorView } from "codemirror";
    import { json } from "@codemirror/lang-json";
    import { EditorState } from "@codemirror/state";
    import { Dices } from "@lucide/svelte";
    import { getSession } from "$lib/app/utils/di";
    import { JSONSchemaFaker } from "json-schema-faker";
    import { zAct, zActData } from "$lib/api/v1/spec";
    import r from "$lib/app/utils/reporting";

    type Props = {
        action: Action;
    };

    let { action }: Props = $props();
    const session = getSession();

    let open = $state(false);

    const schemaJson = $derived(action.schema && JSON.stringify(action.schema, null, 2));
    let schemaEl = $state<HTMLDivElement>();
    let view: EditorView | null = null;
    $effect(() => {
        if (schemaEl && schemaJson) {
            // CM recommends @lezer/highlight over a full editor; however,
            // - line numbers
            // - fold gutter
            // - active line highlighting
            // - active line gutter highlighting
            // - selection match highlighting
            view ??= new EditorView({
                parent: schemaEl,
                doc: schemaJson,
                extensions: [
                    basicSetup,
                    json(),
                    EditorState.readOnly.of(true),
                    EditorView.editable.of(false),
                    EditorView.lineWrapping,
                ],
            });
        } else {
            view?.destroy();
            view = null;
        }
    })

    function sendRandomData() {
        let generatedData: string | undefined;
        if (typeof(action.schema) === "object") {
            try {
                const genObj = JSONSchemaFaker.generate(action.schema);
                generatedData = JSON.stringify(genObj);
            } catch (e) {
                r.error(`Failed to generate random data for ${action.name}`, `${e}`);
                return;
            }
        }
        const actData = zActData.decode({
            name: action.name,
            data: generatedData,
        });
        
        const game = session.registry.games.find(g => g.actions.has(action.name));
        if (!game) {
            r.error(`Action ${action.name} not found in any game`);
            return;
        }

        game.conn.send(zAct.decode({ data: actData }))
            .then(() => {
                const msg = `User act to ${game.name}: ${JSON.stringify(actData)}`;
                session.context.actor({
                    text: msg,
                    silent: false,
                }, true);
                r.debug(msg);
            })
            .catch((e) => r.error(`Failed to send action ${action.name}`, `${e}`));
    }
</script>

<details class="accordion group" bind:open>
    <summary>
        <span>{action.name}</span>
        <div class="actions">
            <button 
                class="action-btn" 
                onclick={sendRandomData}
                title="Send with random data"
            >
                <Dices class="size-4" />
            </button>
        </div>
    </summary>
    <div class="action-description">
        <p>{action.description}</p>
    </div>
    {#if open && schemaJson} <!-- (perf) defer loading editor until user actually opens the action -->
        <details class="accordion">
            <summary>Schema</summary>
            <div class="schema" bind:this={schemaEl}></div>
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
            @apply flex cursor-pointer items-center justify-between gap-2;
            @apply px-4 py-1.5 text-sm font-medium text-neutral-700 transition;
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
        @apply p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100;
        @apply hover:bg-neutral-200 dark:hover:bg-surface-700 transition-colors;
    }
    .action-description {
        @apply space-y-2 px-4 pb-4 pt-2;
        @apply text-neutral-600 dark:text-neutral-200;
    }

    .schema {
        @apply rounded-b-md p-3 text-xs;
        @apply shadow-inner;
        @apply bg-neutral-800 text-neutral-100;
    }

</style>