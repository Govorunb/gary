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
        const res = jsonParse(editorContent).mapErr((e) => e.message)
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
            toast.error(res.error);
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
                The app is running with default settings in read-only mode.
            </p>
            
            <p class="import-label">You may attempt to manually fix the data below: <span class="note">(or get someone you trust to fix it)</span></p>


            <p class="note whitespace-pre-line">
                Please note: <b class="text-lvl-warn">do not share this text with people you don't trust</b>. It contains data you may want to keep private, such as:
            </p>
            <ul class="note list-disc list-inside pl-4">
                <li>Custom engines (including names, URLs/IPs, and <b class="text-sm">API keys</b>)</li>
                <li>The names of some or all games you've ever connected to</li>
            </ul>

            <details class="details-box editor-details" bind:open={editorOpen}>
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
                <button class="btn"
                    onclick={() => navigator.clipboard.writeText(editorContent)}
                >
                    Copy to clipboard
                </button>
                <button class="btn"
                    onclick={async () => editorContent = await navigator.clipboard.readText()}
                >
                    Paste from clipboard
                </button>
                {#if originalData !== editorContent}
                    <button class="btn btn-danger"
                        onclick={async () => editorContent = originalData}
                    >
                        Revert changes
                    </button>
                {/if}
            </div>

            {#if validationError}
                <div class="callout err validation-error">
                    {validationError}
                </div>
            {/if}
        </div>
    {/snippet}
    {#snippet footer()}
        <p class="note">As a last resort, you can reset to defaults: type "RESET" in the editor above and Shift-click the "Import and load" button.</p>
        <div class="flex-1 self-stretch"></div>
        <button
            class={["btn", resetOverride ? "btn-danger" : "btn-primary"]}
            onclick={importFixedJson}
            disabled={!!validationError && !resetOverride}
        >
            {importBtnText}
        </button>
    {/snippet}
    </Dialog>

<style lang="postcss">
    @reference "global.css";

    .title, .error-message {
        @apply text-lvl-warn;
    }

    .error-message {
        @apply text-base font-semibold;
    }

    .import-label {
        @apply font-medium text-ink-1;
    }

    .editor-container {
        @apply flex min-h-50 max-h-100;
    }

    .editor-details {
        @apply mt-1;
        & summary > :global(svg) { @apply size-4; }
    }

    .validation-error {
        @apply text-xs font-mono whitespace-pre-wrap text-lvl-err;
        @apply max-h-48 overflow-y-auto;
    }
</style>
