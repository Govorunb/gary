<script lang="ts">
    import Dialog from "$lib/ui/common/Dialog.svelte";
    import OutLink from "$lib/ui/common/OutLink.svelte";
    import { getUpdater, getUserPrefs } from "$lib/app/utils/di";
    import { isTauri } from "@tauri-apps/api/core";
    import { safeInvoke, sleep } from "$lib/app/utils";
    import { EVENT_BUS } from "$lib/app/events/bus";
    import { toast } from "svelte-sonner";

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
        EVENT_BUS.emit('ui/update/installed', { version: update.version });
        toast.success("Update successful", {
            description: "Restart the app at your convenience to finish the update.",
            action: {
                label: "Restart now",
                async onClick() {
                    if (isTauri()) {
                        await safeInvoke('restart')
                            .orTee((e) => toast.error("Failed to restart", { description: e }));
                        await sleep(2500);
                        toast.success("Erm... awkward...", {
                            description: `Couldn't restart. Um... You'll have to do it manually. My bad.`,
                        });
                    } else {
                        location.reload(); // pretend to relaunch (the app never updates on dev web server obviously)
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
        <h3>Update Available</h3>
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
        {/if}
        <OutLink href="https://github.com/Govorunb/gary/releases/v{update.version}">View release notes on GitHub</OutLink>
        <p>Restart the app at your convenience to finish the update.</p>
    {/snippet}
    {#snippet footer()}
        <button class="btn" onclick={skip}>
            Skip this version
        </button>
        <div class="flex-1 self-stretch"></div>
        <button class="btn" onclick={cancel}>
            Cancel
        </button>
        <button class="btn btn-primary" onclick={doUpdate} disabled={updating}>
            {updating ? "Updating..." : "Update"}
        </button>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .update-message {
        @apply text-base text-ink-1;
    }

    .release-notes {
        @apply pl-3 border-l-2 border-edge;
    }

    .release-notes-title {
        @apply mb-1 text-sm font-medium text-ink-1;
    }

    .release-notes-content {
        @apply text-sm text-ink-2 whitespace-pre-wrap;
    }
</style>
