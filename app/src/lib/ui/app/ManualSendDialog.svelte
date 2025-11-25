<script lang="ts">
    import type { Action } from "$lib/api/v1/spec";
    import type { Game } from "$lib/api/registry.svelte";
    import { basicSetup, EditorView } from "codemirror";
    import { json } from "@codemirror/lang-json";
    import { EditorState } from "@codemirror/state";
    import type { Extension } from "@codemirror/state";
    import { Dialog, Portal } from "@skeletonlabs/skeleton-svelte";
    import { X, Send } from "@lucide/svelte";
    import { getSession } from "$lib/app/utils/di";
    import { zAct, zActData } from "$lib/api/v1/spec";
    import r from "$lib/app/utils/reporting";
    import Ajv from "ajv";

    type Props = {
        open: boolean;
        onOpenChange: (open: boolean) => void;
        action: Action;
        game: Game;
    };

    let { open = $bindable(), onOpenChange, action, game }: Props = $props();
    const session = getSession();
    const ajv = new Ajv({ validateFormats: false });

    let editorEl = $state<HTMLDivElement>();
    let view: EditorView | null = null;
    let jsonContent = $state('{}');
    let validationError = $state<string | null>(null);
    let isValid = $derived(!validationError);
    let editorInitialized = $state(false);

    // Initialize CodeMirror editor when dialog opens
    $effect(() => {
        if (editorEl && open && !editorInitialized) {
            view = new EditorView({
                parent: editorEl,
                doc: jsonContent,
                extensions: [
                    basicSetup,
                    json(),
                    EditorView.lineWrapping,
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            jsonContent = view?.state.doc.toString() || '{}';
                            validateJSON();
                        }
                    }),
                ],
            });
            editorInitialized = true;
        } else if (!open && editorInitialized) {
            view?.destroy();
            view = null;
            editorInitialized = false;
        }
    });

    function validateJSON() {
        try {
            const parsed = JSON.parse(jsonContent);
            
            // Validate against action schema if available
            if (action.schema) {
                const validate = ajv.compile(action.schema);
                const valid = validate(parsed);
                
                if (!valid && validate.errors) {
                    const errorMessages = validate.errors.map(err => 
                        `${err.instancePath || 'root'}: ${err.message}`
                    ).join(', ');
                    validationError = `Schema validation failed: ${errorMessages}`;
                    return;
                }
            }
            
            validationError = null;
        } catch (e) {
            validationError = e instanceof Error ? e.message : 'Invalid JSON';
        }
    }

    function closeDialog() {
        onOpenChange(false);
    }

    async function sendAction() {
        if (!isValid) {
            r.error('Cannot send invalid JSON', validationError || 'Unknown error');
            return;
        }

        const actData = zActData.decode({
            name: action.name,
            data: jsonContent,
        });

        try {
            await game.conn.send(zAct.decode({ data: actData }));
            const msg = `User act to ${game.name}: ${JSON.stringify(actData)}`;
            session.context.actor({ text: msg }, true);
            r.debug(msg);
            closeDialog();
        } catch (e) {
            r.error(`Failed to send action ${action.name}`, `${e}`);
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            closeDialog();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            sendAction();
        }
    }

    // Add keyboard event listener
    $effect(() => {
        if (open) {
            document.addEventListener('keydown', handleKeydown);
            return () => document.removeEventListener('keydown', handleKeydown);
        }
    });
</script>

<Dialog {open} onOpenChange={(d) => onOpenChange(d.open)}>
    <Portal>
        <Dialog.Backdrop class="fixed inset-0 bg-black/20 backdrop-blur-sm transition-opacity" />
        <Dialog.Positioner class="fixed inset-0 flex justify-center items-center align-middle">
            <Dialog.Content>
                <div class="manual-send-content">
                    <div class="dialog-header">
                        <h2 class="text-lg font-bold">Manual Send: {action.name}</h2>
                        <button class="close-btn" onclick={closeDialog} aria-label="Close dialog">
                            <X class="size-4" />
                        </button>
                    </div>
                    
                    <div class="dialog-body">
                        <div class="action-info">
                            <p class="text-sm text-neutral-600 dark:text-neutral-400">{action.description}</p>
                        </div>
                        
                        <div class="editor-section">
                            <div class="editor-label">JSON Data:</div>
                            <div class="editor-container" bind:this={editorEl}></div>
                            {#if validationError}
                                <div class="error-message">
                                    <span class="text-xs font-medium">JSON Error:</span>
                                    <span class="text-xs">{validationError}</span>
                                </div>
                            {/if}
                        </div>
                    </div>
                    
                    <div class="dialog-footer">
                        <button class="btn preset-tonal-surface" onclick={closeDialog}>Cancel</button>
                        <button 
                            class="btn preset-filled-primary" 
                            onclick={sendAction}
                            disabled={!isValid}
                        >
                            <Send class="size-4" />
                            Send
                        </button>
                    </div>
                </div>
            </Dialog.Content>
        </Dialog.Positioner>
    </Portal>
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .manual-send-content {
        @apply flex flex-col gap-4;
        @apply min-w-[32rem] max-w-[90vw] max-h-[80vh] overflow-hidden;
        @apply bg-white dark:bg-surface-900;
        @apply rounded-2xl shadow-2xl;
        @apply p-5 text-sm;
        @apply text-neutral-900 dark:text-neutral-50;
    }

    .dialog-header {
        @apply flex items-center justify-between;
        @apply pb-2 border-b border-neutral-200 dark:border-neutral-700;
    }

    .close-btn {
        @apply p-1 rounded-md transition-colors;
        &:hover {
            @apply bg-neutral-200 dark:bg-neutral-700;
        }
    }

    .dialog-body {
        @apply flex flex-col gap-3;
        @apply flex-1 overflow-hidden;
    }

    .action-info {
        @apply p-3 rounded-lg;
        @apply bg-neutral-100 dark:bg-neutral-800;
        @apply text-neutral-700 dark:text-neutral-300;
    }

    .editor-section {
        @apply flex flex-col gap-2;
        @apply flex-1 overflow-hidden;
    }

    .editor-label {
        @apply text-sm font-medium;
        @apply text-neutral-700 dark:text-neutral-300;
    }

    .editor-container {
        @apply flex-1 min-h-[12rem] max-h-[24rem] overflow-auto;
        @apply border border-neutral-300 dark:border-neutral-600 rounded-lg;
        @apply bg-neutral-50 dark:bg-neutral-900;
    }

    .error-message {
        @apply flex flex-col gap-1;
        @apply p-2 rounded-md;
        @apply bg-red-50 dark:bg-red-900/20;
        @apply text-red-700 dark:text-red-400;
        @apply border border-red-200 dark:border-red-800;
    }

    .dialog-footer {
        @apply flex flex-row justify-end gap-2;
        @apply pt-2 border-t border-neutral-200 dark:border-neutral-700;
    }

    .btn {
        @apply inline-flex items-center gap-2;
        @apply px-3 py-1.5 rounded-md text-sm font-medium;
        @apply transition-colors;
        @apply focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400;
    }

    .preset-tonal-surface {
        @apply bg-neutral-100 text-neutral-700;
        @apply hover:bg-neutral-200;
        @apply dark:bg-neutral-800 dark:text-neutral-300;
        @apply dark:hover:bg-neutral-700;
    }

    .preset-filled-primary {
        @apply bg-sky-500 text-white;
        @apply hover:bg-sky-600;
        @apply disabled:opacity-50 disabled:cursor-not-allowed;
    }
</style>