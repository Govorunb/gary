<script lang="ts">
    import type { Action } from "$lib/api/v1/spec";
    import { basicSetup, EditorView } from "codemirror";
    import { json } from "@codemirror/lang-json";
    import { EditorState } from "@codemirror/state";

    type Props = {
        action: Action;
    };

    let { action }: Props = $props();

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
</script>

<details class="accordion" bind:open>
    <summary>{action.name}</summary>
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