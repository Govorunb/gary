<script lang="ts">
    import Dialog from "$lib/ui/common/Dialog.svelte";
    import OutLink from "$lib/ui/common/OutLink.svelte";
    import { getUpdater, getUserPrefs } from "$lib/app/utils/di";
    import { isTauri } from "@tauri-apps/api/core";
    import r from "$lib/app/utils/reporting";
    import { safeInvoke, sleep } from "$lib/app/utils";

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
                            const res = await safeInvoke('plugin:process|restart');
                            if (res.isErr()) {
                                r.error("Failed to restart", res.error);
                            }
                            await sleep(2500);
                            r.success("Erm... awkward...", {
                                details: `Couldn't restart. Um... You'll have to do it manually. My bad.`,
                                toast: true,
                            });
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
    {#snippet title()}
        <p class="text-xl font-bold">Update Available</p>
    {/snippet}
    {#snippet body()}
        <p class="update-message">
            Update from <span class="font-mono font-semibold">{update.currentVersion}</span> to
            <span class="font-mono font-semibold">{update.version}</span>?
        </p>
        {#if update.body}
            <div class="release-notes">
                <p class="release-notes-title">Release Notes:</p>
                <p class="release-notes-content">{update.body}</p>
            </div>
        {:else}
            <OutLink href="https://github.com/Govorunb/gary/releases/v{update.version}">View release notes on GitHub</OutLink>
        {/if}
        <p>Restart the app at your convenience to finish the update.</p>
    {/snippet}
    {#snippet footer()}
        <button class="btn btn-base skip-btn" onclick={skip}>
            Skip this version
        </button>
        <div class="flex-1 self-stretch"></div>
        <button class="btn btn-base cancel-btn" onclick={cancel}>
            Cancel
        </button>
        <button class="btn btn-base preset-filled-primary-400-600" onclick={doUpdate} disabled={updating}>
            {updating ? "Updating..." : "Update"}
        </button>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

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

    .skip-btn, .cancel-btn {
        @apply bg-neutral-100 text-neutral-700;
        @apply hover:bg-neutral-200;
        @apply dark:bg-neutral-800 dark:text-neutral-300;
        @apply dark:hover:bg-neutral-700;
    }
</style>
