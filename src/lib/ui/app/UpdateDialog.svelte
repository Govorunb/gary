<script lang="ts">
    import Dialog from "$lib/ui/common/Dialog.svelte";
    import { getUpdater, getUserPrefs } from "$lib/app/utils/di";
    import { relaunch as tauriRelaunchProcess } from "@tauri-apps/plugin-process";
    import { isTauri } from "@tauri-apps/api/core";
    import r from "$lib/app/utils/reporting";

    type Props = {
        open: boolean;
    };

    let { open = $bindable() }: Props = $props();
    
    const updater = getUpdater();
    const userPrefs = getUserPrefs();
    const update = $derived(updater.update!);

    let updating = $state(false);

    $effect(() => {
        updating &&= open;
    })

    async function doUpdate() {
        if (updating) return;
        updating = true;
        // you're either updating to the previously skipped version or to an even newer version
        // in both cases, keeping this makes no sense
        userPrefs.app.updates.skipUpdateVersion = undefined;
        
        if (isTauri()) {
            await update.downloadAndInstall();
        }
        r.success("Update successful", {
            toast: {
                description: "Restart the app at your convenience to finish the update.",
                action: {
                    label: "Restart now",
                    async onClick() {
                        if (isTauri()) {
                            // FIXME: AppImage doesn't relaunch
                            await tauriRelaunchProcess();
                        } else {
                            location.reload(); // pretend to relaunch (the app never updates on dev web server obviously)
                        }
                    }
                }
            }
        });
        
        updating = false;
        open = false;
    }

    function skip() {
        userPrefs.app.updates.skipUpdateVersion = update.version;
        open = false;
    }

    function cancel() {
        open = false;
    }
</script>

<Dialog bind:open position="center">
    {#snippet content(props)}
        <div {...props} class="update-dialog-content">
            <div class="dialog-header">
                <p class="text-xl font-bold">Update Available</p>
            </div>

            <div class="dialog-body">
                <p class="update-message">
                    Update from <span class="font-mono font-semibold">{update.currentVersion}</span> to 
                    <span class="font-mono font-semibold">{update.version}</span>?
                </p>
                {#if update.body}
                    <div class="release-notes">
                        <p class="release-notes-title">Release Notes:</p>
                        <p class="release-notes-content">{update.body}</p>
                    </div>
                {/if}
                <p>
                    Restart the app at your convenience to finish the update.
                </p>
            </div>

            <div class="dialog-footer">
                <button class="btn skip-btn" onclick={skip}>
                    Skip this version
                </button>
                <div class="flex-1 self-stretch"></div>
                <button class="btn cancel-btn" onclick={cancel}>
                    Cancel
                </button>
                <button class="btn preset-filled-primary-400-600" onclick={doUpdate} disabled={updating}>
                    {updating ? "Updating..." : "Update"}
                </button>
            </div>
        </div>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .update-dialog-content {
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

    .dialog-body {
        @apply flex flex-col gap-3;
        @apply flex-1 overflow-y-auto;
    }

    .update-message {
        @apply text-base;
        @apply text-neutral-700 dark:text-neutral-300;
    }

    .release-notes {
        @apply p-3 rounded-lg;
        @apply bg-neutral-100 dark:bg-neutral-800;
        @apply border border-neutral-200 dark:border-neutral-700;
    }

    .release-notes-title {
        @apply font-medium text-sm;
        @apply text-neutral-700 dark:text-neutral-300;
        @apply mb-1;
    }

    .release-notes-content {
        @apply text-sm;
        @apply text-neutral-600 dark:text-neutral-400;
        @apply whitespace-pre-wrap;
    }

    .dialog-footer {
        @apply flex items-center justify-between w-full pt-4 gap-4;
        @apply border-t border-neutral-200 dark:border-neutral-700;
    }

    .btn {
        @apply inline-flex items-center gap-2;
        @apply px-3 py-1.5 rounded-md text-sm font-medium;
        @apply transition-all;
        @apply focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400;
    }

    .skip-btn, .cancel-btn {
        @apply bg-neutral-100 text-neutral-700;
        @apply hover:bg-neutral-200;
        @apply dark:bg-neutral-800 dark:text-neutral-300;
        @apply dark:hover:bg-neutral-700;
    }
</style>
