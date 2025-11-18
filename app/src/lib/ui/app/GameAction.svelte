<script lang="ts">
    import type { Action } from "$lib/api/v1/spec";
    import { basicSetup, EditorView } from "codemirror";
    import { json } from "@codemirror/lang-json";
    import { EditorState } from "@codemirror/state";

    type Props = {
        action: Action;
    };

    let { action }: Props = $props();

    const actionJson = $derived(action.schema && JSON.stringify(action.schema, null, 2));
    let schemaEl = $state<HTMLDivElement>();
    let view: EditorView | null = null;
    $effect(() => {
        if (actionJson) {
            // TODO: CM recommends @lezer/highlight over a full editor
            view ??= new EditorView({
                parent: schemaEl,
                doc: actionJson,
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

<details class="accordion">
    <summary>{action.name}</summary>
    <div class="action-description">
        <p>{action.description}</p>
    </div>
    {#if actionJson}
        <details class="accordion">
            <summary>Schema</summary>
            <div class="schema" bind:this={schemaEl}></div>
        </details>
    {/if}
</details>

<style lang="postcss">
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";

    details.accordion {
        @apply rounded-lg;
        @apply border border-neutral-200/70;
        @apply bg-white/80 shadow-sm transition;
        @apply dark:border-neutral-700 dark:bg-neutral-900/60;
        & > summary {
            @apply flex cursor-pointer items-center justify-between gap-2;
            @apply px-4 py-1.5 text-sm font-medium text-neutral-700 transition;
            &:hover {
                @apply bg-neutral-100/80;
                @apply dark:bg-neutral-800/70;
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