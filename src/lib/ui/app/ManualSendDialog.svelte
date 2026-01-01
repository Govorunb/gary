<script lang="ts">
    import type { Action } from "$lib/api/v1/spec";
    import type { Game } from "$lib/api/game.svelte";
    import { basicSetup, EditorView } from "codemirror";
    import { json } from "@codemirror/lang-json";
    import { EditorState } from "@codemirror/state";
    import Dialog from '$lib/ui/common/Dialog.svelte';
    import { Send, ChevronLeft, ChevronRight, Dice6 } from "@lucide/svelte";
    import TeachingTooltip from "$lib/ui/common/TeachingTooltip.svelte";
    import Hotkey from "$lib/ui/common/Hotkey.svelte";
    import { getSession, getUserPrefs } from "$lib/app/utils/di";
    import { zAct, zActData } from "$lib/api/v1/spec";
    import r from "$lib/app/utils/reporting";
    import Ajv, { type ValidateFunction } from "ajv";
    import { tooltip } from "$lib/app/utils";
    import { JSONSchemaFaker } from "json-schema-faker";
    import { boolAttr, PressedKeys } from "runed";
    import { on } from "svelte/events";

    type Props = {
        open: boolean;
        action: Action;
        game: Game;
    };

    let { open = $bindable(), action, game }: Props = $props();
    const session = getSession();
    const userPrefs = getUserPrefs();
    const ajv = new Ajv({ validateFormats: false, allErrors: true });
    const keys = new PressedKeys();
    const shiftPressed = $derived(keys.has("Shift"));
    keys.onKeys(["Control", "Enter"], sendAction);
    keys.onKeys(["Alt", "R"], reroll);

    let editorEl = $state<HTMLDivElement>();
    let schemaEl = $state<HTMLDivElement>();
    let view = $state<EditorView | null>(null);
    let schemaView = $state<EditorView | null>(null);
    let jsonContent = $state(genJson());
    let validationErrors = $state<string[] | null>(null);
    const isValid = $derived(!validationErrors);
    const schemaCollapsed = $derived(userPrefs.app.manualSendSchemaCollapsed);

    function toggleCollapsed() {
        userPrefs.app.manualSendSchemaCollapsed = !userPrefs.app.manualSendSchemaCollapsed;
    }
    
    const validate = $derived((action.schema && ajv.compile(action.schema)) as ValidateFunction);
    const schemaJson = $derived(action.schema && JSON.stringify(action.schema, null, 2));

    function genJson() {
        if (!action.schema) return "";
        return JSON.stringify(JSONSchemaFaker.generate(action.schema), null, 2);
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
        } else if (!open) {
            view?.destroy();
            view = null;
        }
    });
    function reroll() {
        view?.dispatch({
            changes: {
                from: 0,
                to: view.state.doc.length,
                insert: genJson(),
            },
        });
    }
    $effect(() => {
        return editorEl && on(editorEl, 'keydown', (e) => {
            if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
            }
        })
    })

    $effect(() => {
        if (schemaEl && schemaJson) {
            schemaView ??= new EditorView({
                parent: schemaEl,
                doc: schemaJson,
                extensions: [
                    basicSetup,
                    json(),
                    EditorView.lineWrapping,
                    EditorState.readOnly.of(true),
                    EditorView.editable.of(false),
                ],
            });
        } else {
            schemaView?.destroy();
            schemaView = null;
        }
    });
    $effect(() => {
        validateJSON();
    })

    function validateJSON() {
        if (!action.schema) {
            validationErrors = null;
            return;
        }
        try {
            const parsed = JSON.parse(jsonContent);

            const valid = validate(parsed);
            
            if (!valid && validate.errors) {
                const errorMessages = validate.errors.map(err => 
                    `${err.instancePath || '(root)'}: ${err.message}`
                );
                validationErrors = errorMessages;
                return;
            }
            
            validationErrors = null;
        } catch (e) {
            validationErrors = [e instanceof Error ? e.message : 'Invalid JSON'];
        }
    }

    function closeDialog() {
        open = false;
    }

    async function sendAction() {
        if (!isValid && !shiftPressed) return;

        const actData = zActData.decode({
            name: action.name,
            data: jsonContent,
        });

        try {
            const msg = `Manual user act to ${game.name}: ${action.name}`;
            // TODO: should ideally be visible to engine (as user role)
            session.context.actor({ text: msg, visibilityOverrides: { engine: false, user: true } }, true);
            r.debug(msg);
            await game.sendAction(actData);
        } catch (e) {
            r.error(`Failed to send action ${action.name}`, `${e}`);
        } finally {
            closeDialog();
        }
    }
</script>

<Dialog bind:open>
    {#snippet content(props)}
        <div {...props} class="manual-send-content">
                    <div class="dialog-header">
                        <h2 class="text-lg font-bold">Manual Send ({action.name})</h2>
                        <div class="header-actions">
                            <TeachingTooltip>
                                {#if schemaJson}
                                    <p><Hotkey>Alt+R</Hotkey> to use random data. (May not always be valid)</p>
                                {/if}
                                <p><Hotkey>Ctrl+Enter</Hotkey> to send action.</p>
                                {#if schemaJson}
                                    <p>Hold <Hotkey>Shift</Hotkey> to bypass validation.</p>
                                {/if}
                            </TeachingTooltip>
                        </div>
                    </div>
                    
                    <div class="dialog-body">
                        <div class="action-info">
                            <p class="text-sm text-neutral-600 dark:text-neutral-400">{action.description}</p>
                        </div>
                        {#if schemaJson}
                            <div class="editor-section">
                                <div class="editor-header">
                                    <div class="editor-label">Action Data</div>
                                    <button 
                                        class="schema-toggle"
                                        onclick={toggleCollapsed}
                                        {@attach tooltip(schemaCollapsed ? "Show schema" : "Hide schema")}
                                    >
                                        Schema
                                        {#if schemaCollapsed}
                                            <ChevronRight class="size-4" />
                                        {:else}
                                            <ChevronLeft class="size-4" />
                                        {/if}
                                    </button>
                                </div>
                                <div class="editor-split" class:schema-collapsed={schemaCollapsed}>
                                    <div class="editor-panel">
                                        <div class="editor-container" bind:this={editorEl}></div>
                                        {#if validationErrors}
                                            <div class="error-message">
                                                {#each validationErrors as error}
                                                    <span class="text-xs">{error}</span>
                                                {/each}
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="editor-panel" class:hidden={schemaCollapsed}>
                                        <div class="editor-container schema-container" bind:this={schemaEl}></div>
                                    </div>
                                </div>
                            </div>
                        {/if}
                    </div>
                    
                    <div class="dialog-footer">
                        <div class="flex gap-2">
                            {#if schemaJson}
                                <button class="btn subtle-btn"
                                    onclick={reroll}
                                    {@attach tooltip("Replace editor contents with random data (Alt+R)")}
                                >
                                    <Dice6 class="size-4" />
                                    Reroll
                                </button>
                            {/if}
                        </div>
                        <div class="flex gap-2">
                            <button class="btn subtle-btn" onclick={closeDialog}>Cancel</button>
                            <button
                                class="btn send-btn"
                                onclick={sendAction}
                                disabled={!isValid && !shiftPressed}
                                data-bypass={boolAttr(!isValid && shiftPressed)}
                                {@attach tooltip(isValid ? "Send (Ctrl+Enter)"
                                    : shiftPressed ? "Send invalid data?"
                                    : "Hold shift to bypass validation")}
                            >
                                <Send class="size-4" />
                                Send
                            </button>
                        </div>
                    </div>
        </div>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .manual-send-content {
        @apply flex flex-col gap-4;
        @apply min-w-lg max-w-[95vw] max-h-[80vh] overflow-hidden;
        @apply bg-white dark:bg-surface-900;
        @apply rounded-2xl shadow-2xl;
        @apply p-5 text-sm;
        @apply text-neutral-900 dark:text-neutral-50;
    }

    .dialog-header {
        @apply flex items-center justify-between;
        @apply pb-2 border-b border-neutral-200 dark:border-neutral-700;
    }

    .header-actions {
        @apply flex items-center gap-2;
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

    .editor-header {
        @apply flex items-center justify-between;
        @apply pb-2;
    }

    .editor-split {
        @apply flex gap-3;
        @apply flex-1 overflow-hidden;
    }

    .editor-split.schema-collapsed {
        @apply gap-0;
    }

    .editor-panel {
        @apply flex flex-col gap-2;
        @apply flex-1 overflow-hidden;
    }

    .editor-split.schema-collapsed .editor-panel:first-child {
        @apply flex-none w-full;
    }

    .editor-split.schema-collapsed .editor-panel:last-child {
        @apply hidden;
    }

    .schema-toggle {
        @apply flex items-center gap-1;
        @apply px-2 py-1 rounded-md text-lg font-medium;
        @apply bg-neutral-100 dark:bg-neutral-800;
        @apply text-neutral-700 dark:text-neutral-300;
        @apply border border-neutral-200 dark:border-neutral-700;
        @apply transition-colors;
        &:hover {
            @apply bg-neutral-200 dark:bg-neutral-700;
            @apply text-neutral-900 dark:text-neutral-100;
        }
    }

    .editor-label {
        @apply text-lg font-medium;
        @apply self-end;
        @apply text-neutral-700 dark:text-neutral-300;
    }

    .editor-container {
        @apply flex-1 min-w-md min-h-48 max-h-96 overflow-auto;
        @apply border border-neutral-300 dark:border-neutral-600 rounded-lg;
        @apply bg-neutral-50 dark:bg-neutral-900;
        & :global(.cm-editor) {
            @apply h-full;
        }
    }

    .schema-container {
        @apply bg-neutral-100 dark:bg-neutral-800;
        @apply text-neutral-700 dark:text-neutral-300;
    }

    .error-message {
        @apply flex flex-col gap-1;
        @apply p-2 rounded-md;
        @apply bg-red-50 dark:bg-red-900/20;
        @apply text-red-700 dark:text-red-400;
        @apply border border-red-200 dark:border-red-800;
    }

    .dialog-footer {
        @apply flex flex-row justify-between items-center w-full;
        @apply pt-2 border-t border-neutral-200 dark:border-neutral-700;
    }

    .btn {
        @apply inline-flex items-center gap-2;
        @apply px-3 py-1.5 rounded-md text-sm font-medium;
        @apply transition-all;
    }

    .subtle-btn {
        @apply bg-neutral-100 dark:bg-neutral-800;
        @apply text-neutral-700 dark:text-neutral-300;
        &:hover {
            @apply bg-neutral-200 dark:bg-neutral-700;
        }
    }

    .send-btn {
        @apply bg-sky-500 text-white;
        @apply hover:bg-sky-600;
        @apply disabled:opacity-50 disabled:cursor-not-allowed;
        @apply data-bypass:bg-amber-600/60;
    }
</style>
