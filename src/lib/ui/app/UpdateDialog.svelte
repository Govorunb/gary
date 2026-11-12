<script lang="ts">
    import Dialog from "#lib/ui/common/Dialog.svelte";
    import OutLink from "#lib/ui/common/OutLink.svelte";
    import { getUpdater, getUserPrefs } from "#lib/app/utils/di.js";
    import { isTauri } from "@tauri-apps/api/core";
    import { EVENT_BUS } from "#lib/app/events/bus.js";
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
        updater.installedVersion = update.version;
        EVENT_BUS.emit('ui/update/installed', { version: update.version });
        toast.success("Update successful", {
            description: "Restart the app at your convenience to finish the update.",
            action: { label: "Restart now", onClick: () => updater.restart() },
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
        <h3>{updater.installed ? "Update Installed" : "Update Available"}</h3>
    {/snippet}
    {#snippet body()}
        {#if updater.installed}
            <p class="update-message">
                Restart now to finish updating to <span class="font-mono font-semibold">{update.version}</span>?
            </p>
        {:else}
            <p class="update-message">
                Update from <span class="font-mono font-semibold">{update.currentVersion}</span> to
                <span class="font-mono font-semibold">{update.version}</span>?
            </p>
            <!-- the opener plugin only sends `target="_blank"` links to the browser; the rest would navigate the app away -->
            <div class="dialog-scroll fcol-4" onclickcapture={(e) => (e.target as Element).closest("a")?.setAttribute("target", "_blank")}>
                {#each update.releases as release (release.version)}
                    <section class="release-notes">
                        <OutLink href="https://github.com/Govorunb/gary/releases/v{release.version}">v{release.version}</OutLink>
                        <div class="release-notes-content">{@html release.notesHtml}</div>
                    </section>
                {/each}
            </div>
            {#if update.prerelease}
                <p class="note text-lvl-warn">
                    Pre-release: may introduce issues or become incompatible with stable versions. Back up your settings before installing.
                </p>
            {/if}
            <p>Restart the app at your convenience to finish the update.</p>
        {/if}
    {/snippet}
    {#snippet footer()}
        {#if updater.installed}
            <div class="flex-1 self-stretch"></div>
            <button class="btn" onclick={cancel}>
                Later
            </button>
            <button class="btn btn-primary" onclick={() => updater.restart()}>
                Restart now
            </button>
        {:else}
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
        {/if}
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

    /* GitHub-rendered Markdown */
    .release-notes-content {
        @apply fcol-2 mt-1 text-sm text-ink-2;
        & :global(h2) { @apply text-base; }
        & :global(h3) { @apply text-sm; }
        & :global(ul) { @apply pl-5 list-disc; }
        & :global(ol) { @apply pl-5 list-decimal; }
        & :global(code), & :global(kbd) { @apply px-1 rounded bg-layer-2 font-mono text-xs; }
        & :global(a) { @apply text-accent hover:underline; }
    }
</style>
