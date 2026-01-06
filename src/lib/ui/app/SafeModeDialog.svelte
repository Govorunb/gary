<script lang="ts">
    import Dialog from "$lib/ui/common/Dialog.svelte";
    import { getUserPrefs } from "$lib/app/utils/di";
    import { toast } from "svelte-sonner";
    import CodeMirror from "$lib/ui/common/CodeMirror.svelte";
    import { USER_PREFS, zUserPrefs } from "$lib/app/prefs.svelte";
    import { pressedKeys } from "$lib/app/utils/hotkeys.svelte";
    import { formatZodError, jsonParse, safeParse } from "$lib/app/utils";
    import r from "$lib/app/utils/reporting";

    const userPrefs = getUserPrefs();

    let editorContent = $state(localStorage.getItem(USER_PREFS) ?? "{}");
    let validationError = $state<string | null>(null);
    const shiftPressed = $derived(pressedKeys.has('Shift'));

    $effect(() => {
        if (!editorContent.trim()) {
            validationError = "Input is empty";
            return;
        }
        const res = jsonParse(editorContent)
            .mapErr((e) => e.message)
            .andThen((parsed) => safeParse(zUserPrefs, parsed).mapErr((e) => formatZodError(e).join("\n")));
        validationError = res.flip().unwrapOr(null);
    });

    function importFixedJson() {
        if (!editorContent.trim() && shiftPressed) {
            userPrefs.loadError = null;
            return;
        }

        if (validationError) {
            toast.error("Please fix validation errors first");
            return;
        }

        const res = jsonParse(editorContent)
            .mapErr((e) => e.message)
            .andThen((parsed) => userPrefs.importData(parsed));
        if (res.isErr()) {
            validationError = res.error;
            r.error(res.error);
        } else {
            userPrefs.loadError = null;
        }
    }

    const resetOverride = $derived(!editorContent.trim() && shiftPressed);

    const importBtnText = $derived(resetOverride ? "Reset to defaults" : "Import and load");
</script>

<Dialog open={!!userPrefs.loadError} position="center">
    {#snippet content(props)}
        <div {...props} class="safe-mode-content">
            <div class="dialog-header">
                <p class="text-xl font-bold text-amber-700 dark:text-amber-300">
                    Safe Mode Active
                </p>
            </div>

            <div class="dialog-body">
                <p class="error-message">
                    Your preferences failed to load. The app is running with default settings in read-only mode.
                </p>

                <div class="import-section">
                    <p class="import-label">You may attempt to manually fix the data below <span class="note">(or get someone you trust to fix it)</span>:</p>
                    <div class="editor-container">
                        <CodeMirror
                            code={editorContent}
                            open={true}
                            readonly={false}
                            minHeight="200px"
                            maxHeight="400px"
                            onChange={(code) => editorContent = code}
                        />
                    </div>

                    {#if validationError}
                        <div class="validation-error">
                            {validationError}
                        </div>
                    {/if}

                    <p class="note whitespace-pre-line">
                        Please note: <b>do not send this text to people you don't trust</b>.
                        It contains data you may want to keep private, such as:
                    </p>
                    <ul class="note list-disc list-inside pl-4">
                        <li>API keys</li>
                        <li>Custom engines and their URLs/IPs</li>
                        <li>The names of all games you've ever connected to</li>
                    </ul>

                    <div class="import-actions">
                        <p class="note">As a last resort, you can leave the text above empty and Shift-click the import button to reset to defaults.</p>
                        <button
                            class="btn preset-filled-surface-50-950"
                            onclick={importFixedJson}
                            disabled={!!validationError && !resetOverride}
                            class:override={resetOverride}
                        >
                            {importBtnText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .safe-mode-content {
        @apply flex flex-col gap-4;
        @apply min-w-lg max-w-[95vw] max-h-[90vh] overflow-hidden;
        @apply bg-white dark:bg-surface-900;
        @apply rounded-2xl shadow-2xl;
        @apply p-5 text-sm;
        @apply text-neutral-900 dark:text-neutral-50;
        @apply border-2 border-amber-500 dark:border-amber-400;
    }

    .dialog-header {
        @apply flex items-center gap-2 pb-3 border-b border-neutral-200 dark:border-neutral-700;
    }

    .dialog-body {
        @apply flex flex-col gap-4;
        @apply flex-1 overflow-y-auto;
    }

    .error-message {
        @apply font-semibold text-amber-700 dark:text-amber-300;
    }

    .import-section {
        @apply flex flex-col gap-2;
    }

    .import-label {
        @apply font-medium text-neutral-700 dark:text-neutral-300;
    }

    .note {
        @apply text-neutral-600 dark:text-neutral-400;
    }

    .editor-container {
        @apply h-full;
    }

    .validation-error {
        @apply p-3 rounded-md;
        @apply bg-red-50 dark:bg-red-900/30;
        @apply border border-red-200 dark:border-red-800;
        @apply text-red-700 dark:text-red-300;
        @apply text-xs font-mono whitespace-pre-wrap;
        @apply max-h-48 overflow-y-auto;
    }

    .import-actions {
        @apply flex flex-wrap gap-2 justify-between items-center;
        & > button.override {
            @apply bg-error-50 dark:bg-error-950;
        }
    }
</style>
