<script lang="ts">
    import Dialog from "$lib/ui/common/Dialog.svelte";
    import ShiftIndicator from "$lib/ui/common/ShiftIndicator.svelte";
    import { getUserPrefs } from "$lib/app/utils/di";
    import { toast } from "svelte-sonner";
    import CodeMirror from "$lib/ui/common/CodeMirror.svelte";
    import { Eye, EyeOff } from "@lucide/svelte";
    import { USER_PREFS, zUserPrefs } from "$lib/app/prefs.svelte";
    import { pressedKeys } from "$lib/app/utils/hotkeys.svelte";
    import { formatZodError, jsonParse, safeParse } from "$lib/app/utils";
    import r from "$lib/app/utils/reporting";

    const userPrefs = getUserPrefs();

    let editorContent = $state(localStorage.getItem(USER_PREFS) ?? "{}");
    // svelte-ignore state_referenced_locally
    const originalData = $state.snapshot(editorContent);
    let validationError = $state<string | null>(null);
    let editorOpen = $state(false);
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
        if (resetOverride) {
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

    const resetOverride = $derived(editorContent.trim().toLowerCase() === "reset" && shiftPressed);

    const importBtnText = $derived(resetOverride ? "Reset to defaults" : "Import and load");
</script>

<Dialog open={!!userPrefs.loadError} position="center"
    closeOnInteractOutside={false} closeOnEscape={false}
    class="attention"
>
    {#snippet title()}
        <h2 class="title">Safe Mode Active</h2>
        <ShiftIndicator />
    {/snippet}
    {#snippet body()}
        <div class="fcol-scroll-2">
            <p class="error-message">
                Your preferences failed to load. The app is running with default settings in read-only mode.
            </p>
            
            <p class="import-label">You may attempt to manually fix the data below: <span class="note">(or get someone you trust to fix it)</span></p>


            <p class="note whitespace-pre-line">
                Please note: <b class="text-warning-900-100">do not share this text with people you don't trust</b>. It contains data you may want to keep private, such as:
            </p>
            <ul class="note list-disc list-inside pl-4">
                <li>Custom engines (including names, URLs/IPs, and <b class="text-sm">API keys</b>)</li>
                <li>The names of some or all games you've ever connected to</li>
            </ul>

            <details class="editor-details" bind:open={editorOpen}>
                <summary>
                    {#if editorOpen}
                        <EyeOff />
                    {:else}
                        <Eye />
                    {/if}
                    {!editorOpen ? "Show" : "Hide"} editor
                </summary>
                {#if editorOpen}
                    <div class="editor-container">
                        <CodeMirror
                            code={editorContent}
                            open={true}
                            readonly={false}
                            onChange={(code) => editorContent = code}
                        />
                    </div>
                {/if}
            </details>

            <div class="frow-2">
                <button class="btn btn-base preset-outlined-surface-300-700"
                    onclick={() => navigator.clipboard.writeText(editorContent)}
                >
                    Copy to clipboard
                </button>
                <button class="btn btn-base preset-outlined-surface-300-700"
                    onclick={async () => editorContent = await navigator.clipboard.readText()}
                >
                    Paste from clipboard
                </button>
                <button class="btn btn-base preset-outlined-warning-300-700"
                    onclick={async () => editorContent = originalData}
                >
                    Revert changes
                </button>
            </div>

            {#if validationError}
                <div class="validation-error">
                    {validationError}
                </div>
            {/if}
        </div>
    {/snippet}
    {#snippet footer()}
        <p class="note">As a last resort, you can reset to defaults: type "RESET" in the editor above and Shift-click the "Import and load" button.</p>
        <div class="flex-1 self-stretch"></div>
        <button
            class="btn preset-filled-surface-50-950"
            onclick={importFixedJson}
            disabled={!!validationError && !resetOverride}
            class:override={resetOverride}
        >
            {importBtnText}
        </button>
    {/snippet}
    </Dialog>

<style lang="postcss">
    @reference "global.css";

    .title {
        @apply text-amber-700 dark:text-amber-300;
    }

    .error-message {
        @apply text-base font-semibold text-warning-700 dark:text-warning-300;
    }

    .import-label {
        @apply font-medium text-neutral-700 dark:text-neutral-300;
    }

    .editor-container {
        @apply flex min-h-50 max-h-100;
    }

    .editor-details {
        @apply mt-1 border border-neutral-200 dark:border-neutral-700 rounded-md;
        padding: 0.5rem;
        &[open] summary {
            @apply pb-2;
        }
        & summary {
            @apply frow-1.5 items-center cursor-pointer select-none;
            @apply text-sm font-semibold;
            @apply transition-[filter];
            &:hover {
                @apply brightness-125 dark:brightness-75;
            }
        }
    }

    .validation-error {
        @apply p-3 rounded-md;
        @apply bg-red-50 dark:bg-red-900/30;
        @apply border border-red-200 dark:border-red-800;
        @apply text-red-700 dark:text-red-300;
        @apply text-xs font-mono whitespace-pre-wrap;
        @apply max-h-48 overflow-y-auto;
    }

    button.override {
        @apply bg-error-50 dark:bg-error-950;
    }
</style>
