<script lang="ts">
    import type { Game } from "$lib/api/registry.svelte";
    import { basicSetup, EditorView } from "codemirror";
    import { json } from "@codemirror/lang-json";
    import { Dialog, Portal } from "@skeletonlabs/skeleton-svelte";
    import { Send } from "@lucide/svelte";
    import TeachingTooltip from "$lib/ui/common/TeachingTooltip.svelte";
    import Hotkey from "$lib/ui/common/Hotkey.svelte";
    import { getUserPrefs } from "$lib/app/utils/di";
    import { zNeuroMessage } from "$lib/api/v1/spec";
    import r from "$lib/app/utils/reporting";
    import { jsonParse, safeParse, tooltip } from "$lib/app/utils";
    import { PressedKeys } from "runed";
    import { on } from "svelte/events";

    type Props = {
        open: boolean;
        onOpenChange: (open: boolean) => void;
        game: Game;
    };

    let { open = $bindable(), onOpenChange, game }: Props = $props();
    const userPrefs = getUserPrefs();
    const keys = new PressedKeys();
    keys.onKeys(["Control", "Enter"], sendMessage);
    keys.onKeys(["Control", "E"], closeDialog); // FIXME: engine picker hotkey workaround thing

    let editorEl = $state<HTMLDivElement>();
    let view = $state<EditorView | null>(null);
    let jsonContent = $state('');
    let validationErrors = $state<string[] | null>(null);
    let selectedPreset = $derived(userPrefs.app.rawSendSelectedPreset);

    const messagePresets = {
        empty: { name: '(empty)', template: '', experimental: false },
        action: { 
            name: 'action', 
            template: JSON.stringify({
                command: "action",
                data: {
                    id: "example-id",
                    name: "action_name",
                    data: "{}"
                }
            }, null, 2),
            experimental: false
        },
        'actions/reregister_all': { 
            name: 'actions/reregister_all', 
            template: JSON.stringify({
                command: "actions/reregister_all"
            }, null, 2),
            experimental: true
        },
        'shutdown/graceful': { 
            name: 'shutdown/graceful', 
            template: JSON.stringify({
                command: "shutdown/graceful",
                data: {
                    wants_shutdown: true,
                }
            }, null, 2),
            experimental: true
        },
        'shutdown/immediate': { 
            name: 'shutdown/immediate', 
            template: JSON.stringify({
                command: "shutdown/immediate"
            }, null, 2),
            experimental: true
        }
    };

    function applyPreset(presetKey: string) {
        if (!(presetKey in messagePresets)) {
            return;
        }
        let key = presetKey as keyof typeof messagePresets;
        selectedPreset = key;
        const preset = messagePresets[key];
        if (preset && view) {
            view.dispatch({
                changes: {
                    from: 0,
                    to: view.state.doc.length,
                    insert: preset.template,
                },
            });
        }
    }

    $effect(() => {
        if (editorEl && open && !view) {
            view = new EditorView({
                parent: editorEl,
                doc: jsonContent,
                extensions: [
                    basicSetup,
                    json(),
                    EditorView.lineWrapping,
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            jsonContent = view!.state.doc.toString();
                            validateJSON();
                        }
                    }),
                ],
            });
            validateJSON();
            // Focus the editor when dialog opens
            view.focus();
        } else if (!open) {
            view?.destroy();
            view = null;
        }
    });

    $effect(() => {
        if (!editorEl) return;
        return on(editorEl, 'keyup', (e) => {
            if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
            }
        })
    })

    function validateJSON() {
        if (!jsonContent.trim()) {
            validationErrors = ['Message should not be empty'];
            return;
        }
        
        const result = jsonParse(jsonContent).andThen(c => safeParse(zNeuroMessage, c));
        
        if (result.isErr()) {
            if ('issues' in result.error) { // zod parse failed
                const errorMessages = result.error.issues.map(err => 
                    `${err.path.join('.') || '(root)'}: ${err.message}`
                );
                validationErrors = errorMessages;
            } else { // json parse failed
                validationErrors = [result.error.message ?? "Invalid JSON"];
            }
            return;
        }
        
        validationErrors = null;
    }

    function closeDialog() {
        onOpenChange(false);
    }

    async function sendMessage() {
        try {
            await game.conn.sendRaw(jsonContent);
            r.success("Sent raw WebSocket message", {toast: true});
        } catch (e) {
            r.error(`Failed to send raw message to ${game.name}`, `${e}`);
        } finally {
            closeDialog();
        }
    }
</script>

<Dialog {open} onOpenChange={(d) => onOpenChange(d.open)}>
    <Portal>
        <Dialog.Backdrop class="fixed inset-0 bg-black/20 backdrop-blur-sm transition-opacity" />
        <Dialog.Positioner class="fixed inset-0 flex justify-center items-center align-middle">
            <Dialog.Content>
                <div class="raw-message-content">
                    <div class="dialog-header">
                        <h2 class="text-lg font-bold">Send Raw Message ({game.name})</h2>
                        <div class="header-actions">
                            <TeachingTooltip>
                                <p>Send any arbitrary text WebSocket message.</p>
                                <p><b>This dialog is for debugging and won't stop you from sending invalid data.</b></p>
                                <p><Hotkey>Ctrl+Enter</Hotkey> to send message.</p>
                            </TeachingTooltip>
                        </div>
                    </div>
                    
                    <div class="dialog-body">
                        <div class="editor-section">
                            <div class="editor-panel">
                                <div class="editor-container" bind:this={editorEl} aria-label="Message JSON editor"></div>
                                {#if validationErrors}
                                    <div class="validation-warnings">
                                        <div class="warning-header">Validation Warnings:</div>
                                        {#each validationErrors as error}
                                            <div class="warning-item">{error}</div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </div>
                    
                    <div class="dialog-footer">
                        <div class="flex gap-2">
                            <div class="preset-dropdown flex flex-row items-center gap-2.5">
                                <label for="preset-select">Template:</label>
                                <select 
                                    id="preset-select"
                                    bind:value={selectedPreset} 
                                    onchange={(e) => applyPreset((e.target as HTMLSelectElement).value)}
                                    class="preset-select"
                                    aria-label="Select message template"
                                >
                                    {#each Object.entries(messagePresets) as [key, preset]}
                                        {#if !preset.experimental}
                                            <option value={key}>{preset.name}</option>
                                        {/if}
                                    {/each}
                                    <option disabled>--- Experimental ---</option>
                                    {#each Object.entries(messagePresets) as [key, preset]}
                                        {#if preset.experimental}
                                            <option value={key}>{preset.name}</option>
                                        {/if}
                                    {/each}
                                </select>
                                <TeachingTooltip>
                                    Selecting a template will replace the contents of your editor.
                                </TeachingTooltip>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button class="btn preset-tonal-surface" onclick={closeDialog}>Cancel</button>
                            <button
                                class="btn preset-filled-primary-400-600"
                                onclick={sendMessage}
                                {@attach tooltip("Send (Ctrl+Enter)")}
                            >
                                <Send class="size-4" />
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </Dialog.Content>
        </Dialog.Positioner>
    </Portal>
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .raw-message-content {
        @apply flex flex-col gap-4 p-5 text-sm;
        @apply min-w-lg max-w-[95vw] max-h-[80vh] overflow-hidden;
        @apply bg-white dark:bg-surface-900 rounded-2xl shadow-2xl;
        @apply text-neutral-900 dark:text-neutral-50;
    }

    .dialog-header {
        @apply flex items-center justify-between pb-2;
        @apply border-b border-neutral-200 dark:border-neutral-700;
    }

    .header-actions {
        @apply flex items-center gap-2;
    }

    .dialog-body {
        @apply flex flex-col gap-3 flex-1 overflow-hidden;
    }

    .editor-section {
        @apply flex gap-3 flex-1 overflow-hidden;
    }

    .editor-panel {
        @apply flex flex-col gap-2 flex-1 overflow-hidden;
    }

    .editor-container {
        @apply flex-1 min-w-md min-h-48 max-h-96 overflow-auto;
        @apply border border-neutral-300 dark:border-neutral-600 rounded-lg;
        @apply bg-neutral-50 dark:bg-neutral-900;
        
        & :global(.cm-editor) {
            @apply h-full;
        }
    }

    .validation-warnings {
        @apply flex flex-col gap-1 p-2 rounded-md;
        @apply bg-amber-50 dark:bg-amber-900/20;
        @apply text-amber-700 dark:text-amber-400;
        @apply border border-amber-200 dark:border-amber-800;
    }

    .warning-header {
        @apply text-xs font-medium text-amber-800 dark:text-amber-300;
    }

    .warning-item {
        @apply text-xs;
    }

    .dialog-footer {
        @apply flex items-center justify-between w-full pt-2;
        @apply border-t border-neutral-200 dark:border-neutral-700;
    }

    .preset-dropdown {
        @apply relative;
    }

    .preset-select {
        @apply w-full px-3 py-2 pr-8 appearance-none;
        @apply border border-neutral-300 dark:border-neutral-600 rounded-lg;
        @apply bg-white dark:bg-neutral-800;
        @apply text-neutral-900 dark:text-neutral-100;
        @apply focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400;
    }

    .btn {
        @apply inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium;
        @apply transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400;
    }
</style>