<script lang="ts">
    import type { Action } from "$lib/api/v1/spec";
    import type { Game } from "$lib/api/game.svelte";
    import Dialog from '$lib/ui/common/Dialog.svelte';
    import CodeMirror from '$lib/ui/common/CodeMirror.svelte';
    import ShiftIndicator from '$lib/ui/common/ShiftIndicator.svelte';
    import { Send, ChevronLeft, ChevronRight, Dice6 } from "@lucide/svelte";
    import TeachingTooltip from "$lib/ui/common/TeachingTooltip.svelte";
    import Hotkey from "$lib/ui/common/Hotkey.svelte";
    import { getSession, getUserPrefs } from "$lib/app/utils/di";
    import Ajv, { type ValidateFunction } from "ajv";
    import { emptyValueFromJsonSchema, generateFromJsonSchema, parseError, tooltip } from "$lib/app/utils";
    import { boolAttr, PressedKeys } from "runed";
    import { EVENT_BUS } from "$lib/app/events/bus";
    import type { JsonSchema } from "json-schema-faker";

    type Props = {
        open: boolean;
        action: Action;
        game: Game;
    };

    let { open = $bindable(), action, game }: Props = $props();
    const userPrefs = getUserPrefs();
    const ajv = new Ajv({ validateFormats: false, allErrors: true });
    const keys = new PressedKeys();
    const shiftPressed = $derived(keys.has("Shift"));
    keys.onKeys(["Control", "Enter"], sendAction);
    keys.onKeys(["Alt", "R"], reroll);

    const currentAction = $derived(game.getAction(action.name, false) ?? action);
    const evtData = $derived({gameId: game.id, actionName: currentAction.name});

    let jsonContent = $state("");
    let validationErrors = $state<string[] | null>(null);
    let latestGenerationRequest = 0;
    const isValid = $derived(!validationErrors);
    const schemaCollapsed = $derived(userPrefs.app.manualSendSchemaCollapsed);
    const schemaOpen = $derived(!schemaCollapsed);

    function toggleCollapsed() {
        userPrefs.app.manualSendSchemaCollapsed = !userPrefs.app.manualSendSchemaCollapsed;
    }

    const validate = $derived((currentAction.schema && ajv.compile(currentAction.schema)) as ValidateFunction);
    const schemaJson = $derived(currentAction.schema && JSON.stringify(currentAction.schema, null, 2));

    function initialJson(actionToGenerate: Action) {
        if (!actionToGenerate.schema) return "";
        return JSON.stringify(emptyValueFromJsonSchema(actionToGenerate.schema as JsonSchema), null, 2);
    }

    async function randomJson(actionToGenerate: Action) {
        if (!actionToGenerate.schema) return "";
        return JSON.stringify(await generateFromJsonSchema(actionToGenerate.schema as JsonSchema), null, 2);
    }

    $effect(() => {
        validateJSON();
    })

    $effect(() => {
        const actionForDialog = currentAction;
        void populateInitialJson(actionForDialog);
    });

    async function populateInitialJson(actionToGenerate: Action) {
        const request = ++latestGenerationRequest;
        try {
            const initialJsonContent = initialJson(actionToGenerate);
            jsonContent = initialJsonContent;

            if (!actionToGenerate.schema || isValidJsonForAction(initialJsonContent, actionToGenerate)) {
                return;
            }

            const generatedJson = await randomJson(actionToGenerate);
            if (request === latestGenerationRequest) {
                jsonContent = generatedJson;
            }
        } catch (e) {
            EVENT_BUS.emit('ui/game/user_act/generate_error', { ...evtData, error: parseError(e) });
        }
    }

    async function populateRandomJson(actionToGenerate: Action) {
        const request = ++latestGenerationRequest;
        try {
            const nextJson = await randomJson(actionToGenerate);
            if (request === latestGenerationRequest) {
                jsonContent = nextJson;
            }
        } catch (e) {
            EVENT_BUS.emit('ui/game/user_act/generate_error', { ...evtData, error: parseError(e) });
        }
    }

    function reroll() {
        void populateRandomJson(currentAction);
    }

    function handleCodeChange(newCode: string) {
        jsonContent = newCode;
    }

    function isValidJsonForAction(json: string, actionToValidate: Action) {
        if (!actionToValidate.schema) return true;
        try {
            return ajv.compile(actionToValidate.schema)(JSON.parse(json));
        } catch {
            return false;
        }
    }

    function validateJSON() {
        if (!currentAction.schema) {
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

        const actionToSend = currentAction;
        EVENT_BUS.emit('ui/game/user_act/send', { ...evtData, hasData: !!jsonContent });
        game.manualSend(actionToSend.name, jsonContent)
            .catch(e => {
                EVENT_BUS.emit('ui/game/user_act/send_error', { ...evtData, error: parseError(e) });
            })
            .finally(closeDialog);
    }
</script>

<Dialog bind:open>
    {#snippet title()}
        <h3>Manual Send ({currentAction.name})</h3>
        <div class="header-actions">
            <ShiftIndicator />
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
    {/snippet}
    {#snippet body()}
        <div class="action-info">
            <p class="text-sm text-neutral-600 dark:text-neutral-400">{currentAction.description}</p>
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
                        <CodeMirror
                            code={jsonContent}
                            {open}
                            onChange={handleCodeChange}
                            minHeight="12rem"
                            maxHeight="24rem"
                        />
                        {#if validationErrors}
                            <div class="error-message">
                                {#each validationErrors as error}
                                    <span class="text-xs">{error}</span>
                                {/each}
                            </div>
                        {/if}
                    </div>
                    <div class="editor-panel" class:hidden={schemaCollapsed}>
                        {#if schemaJson}
                            <CodeMirror
                                code={schemaJson}
                                open={schemaOpen}
                                readonly
                                minHeight="12rem"
                                maxHeight="24rem"
                            />
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
    {/snippet}
    {#snippet footer()}
        <div class="frow-2">
            {#if schemaJson}
                <button class="btn btn-base subtle-btn"
                    onclick={reroll}
                    {@attach tooltip("Replace editor contents with random data (Alt+R)")}
                >
                    <Dice6 class="size-4" />
                    Randomize
                </button>
            {/if}
        </div>
        <div class="frow-2">
            <button class="btn btn-base subtle-btn" onclick={closeDialog}>Cancel</button>
            <button
                class="btn btn-base send-btn"
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
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .action-info {
        @apply p-3 rounded-lg;
        @apply bg-neutral-100 dark:bg-neutral-800;
        @apply text-neutral-700 dark:text-neutral-300;
    }

    .editor-section {
        @apply fcol-2 flex-1 overflow-hidden;
    }

    .editor-header {
        @apply flex items-center justify-between;
        @apply pb-2;
    }

    .editor-split {
        @apply frow-3;
        @apply flex-1 overflow-hidden;
    }

    .editor-split.schema-collapsed {
        @apply gap-0;
    }

    .editor-panel {
        @apply fcol-2 flex-1 overflow-hidden;
    }

    .editor-split.schema-collapsed .editor-panel:first-child {
        @apply flex-none w-full;
    }

    .editor-split.schema-collapsed .editor-panel:last-child {
        @apply hidden;
    }

    .schema-toggle {
        @apply frow-1 items-center;
        @apply px-2 py-1.5 rounded-md text-base font-medium;
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

    .error-message {
        @apply fcol-1 p-2 rounded-md;
        @apply bg-red-50 dark:bg-red-900/20;
        @apply text-red-700 dark:text-red-400;
        @apply border border-red-200 dark:border-red-800;
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
