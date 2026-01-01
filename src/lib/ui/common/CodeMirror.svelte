<script lang="ts">
    import { basicSetup, EditorView } from "codemirror";
    import { EditorState } from "@codemirror/state";
    import { json } from "@codemirror/lang-json";

    type Props = {
        code: string;
        open?: boolean;
        readonly?: boolean;
        lineWrap?: boolean;
        minHeight?: string;
        maxHeight?: string;
        onChange?: (code: string) => void;
    };

    let {
        code,
        open = false,
        readonly = false,
        lineWrap = true,
        minHeight,
        maxHeight,
        onChange,
    }: Props = $props();

    let editorEl = $state<HTMLDivElement>();
    let view: EditorView | null = null;

    $effect(() => {
        if (!open) {
            view?.destroy();
            view = null;
            return;
        }

        if (!view) {
            const extensions = [
                basicSetup,
                json(),
                lineWrap ? EditorView.lineWrapping : [],
                ...(readonly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
            ];

            if (onChange) {
                extensions.push(
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged && view) {
                            onChange(view.state.doc.toString());
                        }
                    })
                );
            }

            view = new EditorView({
                parent: editorEl,
                doc: code,
                extensions,
            });
        } else {
            const currentDoc = view.state.doc.toString();
            if (currentDoc !== code) {
                view.dispatch({
                    changes: { from: 0, to: view.state.doc.length, insert: code },
                });
            }
        }
    });
</script>

<div class="codemirror-container"
    style:min-height={minHeight}
    style:max-height={maxHeight}
    bind:this={editorEl}
    aria-label="Code editor"
></div>

<style lang="postcss">
    @reference "global.css";

    .codemirror-container {
        @apply flex-1 overflow-auto;
        @apply border border-neutral-300 dark:border-neutral-600 rounded-lg;
        @apply bg-neutral-50 dark:bg-neutral-900;
        @apply text-xs;
        & :global(.cm-editor) {
            @apply h-full;
        }
    }
</style>
