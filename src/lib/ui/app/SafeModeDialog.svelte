<script lang="ts">
    import Dialog from "$lib/ui/common/Dialog.svelte";
    import { getUserPrefs } from "$lib/app/utils/di";
    import { Clipboard, RotateCcw, Upload } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { ResultAsync } from "neverthrow";
    import { USER_PREFS } from "$lib/app/prefs.svelte";

    const userPrefs = getUserPrefs();

    let importInput = $state("");

    async function exportToClipboard() {
        await ResultAsync.fromPromise(navigator.clipboard.writeText(localStorage.getItem(USER_PREFS)!), () => {})
            .match(
                () => toast.success("Copied to clipboard"),
                () => toast.error("Failed to copy to clipboard")
            );
    }

    function importFixedJson() {
        if (!importInput.trim()) {
            toast.error("Please paste the corrected JSON");
            return;
        }

        userPrefs.importData(importInput).match(
            () => {
                localStorage.setItem(USER_PREFS, importInput);
                toast.success("Import successful. Reloading...");
                setTimeout(() => location.reload(), 1000);
            },
            (e) => toast.error(`Failed to import: ${e}`)
        );
    }

    function importFromClipboard() {
        ResultAsync.fromPromise(
            navigator.clipboard.readText(),
            () => "Failed to read clipboard"
        ).match(
            (text) => {
                importInput = text;
                toast.success("Pasted from clipboard");
            },
            (e) => toast.error(e)
        );
    }

    function revertToDefaults() {
        const warning = "This will replace your preferences with default values. Your current data will be lost.\n\nConfirm?";
        if (!confirm(warning)) return;

        userPrefs.loadError = null;
    }
</script>

<Dialog open={!!userPrefs.loadError} position="center" onOpenChange={() => {}}>
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

                <div class="error-details">
                    <p class="details-label">Error details:</p>
                    <pre class="error-text">{userPrefs.loadError}</pre>
                </div>

                <div class="actions">
                    <p class="actions-label">You can fix this by:</p>
                    <ol class="action-list">
                        <li>
                            <span class="step-number">1</span>
                            <span>Export your current preferences data:</span>
                            <div class="step-actions">
                                <button class="btn preset-outlined-surface-300-700" onclick={exportToClipboard}>
                                    <Clipboard size={16} />
                                    Copy to clipboard
                                </button>
                            </div>
                        </li>
                        <li>
                            <span class="step-number">2</span>
                            <span>Fix the errors in a text editor</span>
                        </li>
                        <li>
                            <span class="step-number">3</span>
                            <span>Paste the corrected JSON back and reload</span>
                        </li>
                    </ol>
                </div>

                <div class="revert-section">
                    <p class="revert-label">Or, if you don't need your current preferences:</p>
                    <button class="btn preset-tonal-error" onclick={revertToDefaults}>
                        <RotateCcw size={16} />
                        Revert to defaults
                    </button>
                </div>

                <div class="import-section">
                    <p class="import-label">After fixing the errors, paste the corrected JSON here:</p>
                    <textarea
                        class="import-textarea"
                        bind:value={importInput}
                        placeholder="Paste your corrected JSON here..."
                    ></textarea>
                    <div class="import-actions">
                        <button class="btn preset-tonal-surface-200-700" onclick={importFromClipboard}>
                            <Clipboard size={16} />
                            Paste from clipboard
                        </button>
                        <button class="btn preset-filled-surface-50-950" onclick={importFixedJson}>
                            <Upload size={16} />
                            Import and reload
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

    .error-details {
        @apply flex flex-col gap-2;
    }

    .details-label {
        @apply font-medium text-neutral-700 dark:text-neutral-300;
    }

    .error-text {
        @apply p-3 rounded-md;
        @apply bg-red-50 dark:bg-red-900/30;
        @apply border border-red-200 dark:border-red-800;
        @apply text-red-700 dark:text-red-300;
        @apply text-xs font-mono whitespace-pre-wrap break-all;
        @apply max-h-48 overflow-y-auto;
    }

    .actions {
        @apply flex flex-col gap-3;
    }

    .actions-label {
        @apply font-medium text-neutral-700 dark:text-neutral-300;
    }

    .action-list {
        @apply flex flex-col gap-4 ml-1;
        @apply list-none;
    }

    .action-list li {
        @apply flex items-start gap-3;
    }

    .step-number {
        @apply shrink-0 flex items-center justify-center;
        @apply w-6 h-6 rounded-full;
        @apply bg-surface-200 dark:bg-surface-700;
        @apply text-neutral-900 dark:text-neutral-100;
        @apply text-xs font-bold;
    }

    .step-actions {
        @apply flex flex-wrap gap-2 mt-2 ml-9;
    }

    .revert-section {
        @apply flex flex-col gap-2;
        @apply p-4 rounded-lg;
        @apply bg-surface-50 dark:bg-surface-800;
        @apply border border-neutral-200 dark:border-neutral-700;
    }

    .revert-label {
        @apply text-neutral-600 dark:text-neutral-400;
    }

    .import-section {
        @apply flex flex-col gap-2;
    }

    .import-label {
        @apply font-medium text-neutral-700 dark:text-neutral-300;
    }

    .import-textarea {
        @apply w-full h-32 p-3 rounded-md;
        @apply bg-white dark:bg-surface-800;
        @apply border border-neutral-300 dark:border-neutral-600;
        @apply text-neutral-900 dark:text-neutral-100;
        @apply text-xs font-mono resize-none;
        @apply focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400;
    }

    .import-actions {
        @apply flex flex-wrap gap-2;
    }
</style>
