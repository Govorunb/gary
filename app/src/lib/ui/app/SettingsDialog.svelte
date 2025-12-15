<script lang="ts">
    import { getUpdater, getUserPrefs } from "$lib/app/utils/di";
    import Dialog from "$lib/ui/common/Dialog.svelte";
    import ThemePicker from "$lib/ui/common/ThemePicker.svelte";
    import Hotkey from "../common/Hotkey.svelte";
    import dayjs from "dayjs";

    type Props = {
        open: boolean;
    };

    let { open = $bindable() }: Props = $props();

    const userPrefs = getUserPrefs();
    const updater = getUpdater();

    function closeDialog() {
        open = false;
    }
    function checkForUpdates() {
        void updater.checkForUpdates(true);
    }

    const lastCheckedAt = $derived.by(() => {
        const str = userPrefs.app.updates.lastCheckedAt;
        if (!str) return "never";
        let date = dayjs(str).startOf('day');
        return date.toDate().toLocaleDateString()
    });
</script>

<Dialog bind:open position="center">
    {#snippet content(props)}
        <div {...props} class="settings-content">
            <div class="dialog-header">
                <p class="text-xl font-bold">Settings</p>
                <Hotkey>Ctrl+,</Hotkey>
            </div>

            <div class="dialog-body">
                <div class="settings-section">
                    <p class="section-title">General</p>

                    <div class="theme-field">
                        <p class="field-label">Theme</p>
                        <ThemePicker />
                    </div>
                </div>
                <div class="settings-section">
                    <p class="section-title">Updates</p>

                    <div class="flex flex-col gap-1">
                        <p class="font-light">Updates are automatically checked on app launch:</p>
                        <select class="select" bind:value={userPrefs.app.updates.autoCheckInterval}>
                            <option value="everyLaunch">Every launch</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="off">Never</option>
                        </select>
                    </div>
                    <div class="flex flex-row gap-2 items-center">
                        <button class="btn preset-outlined-surface-300-700"
                            onclick={checkForUpdates} disabled={updater.checkingForUpdates}
                            >
                            Check now
                        </button>
                        <p class="note">Last checked: {lastCheckedAt}</p>
                    </div>
                </div>
            </div>

            <div class="dialog-footer">
                <div class="flex-1"></div>
                <div class="flex gap-2">
                    <button class="btn preset-tonal-surface" onclick={closeDialog}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .settings-content {
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

    .dialog-footer {
        @apply flex items-center justify-between w-full pt-4;
        @apply border-t border-neutral-200 dark:border-neutral-700;
    }

    .settings-section {
        @apply flex flex-col gap-3;
        @apply p-4 rounded-lg;
        @apply bg-surface-50 dark:bg-surface-800;
        @apply border border-neutral-200 dark:border-neutral-700;
    }

    .section-title {
        @apply h4;
        @apply text-neutral-900 dark:text-neutral-50;
    }

    .section-description {
        @apply text-sm;
        @apply text-neutral-600 dark:text-neutral-400;
    }

    .theme-field {
        @apply flex items-center gap-3;
    }

    .field-label {
        @apply text-sm font-medium select-none;
        @apply text-neutral-700 dark:text-neutral-300;
    }
    
    select {
        @apply w-full px-3 py-2 pr-8 appearance-none;
        @apply border border-neutral-300 dark:border-neutral-600 rounded-lg;
        @apply bg-white dark:bg-neutral-800;
        @apply text-neutral-900 dark:text-neutral-100;
        @apply focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400;
        &::content, &::slotted {
            @apply rounded-lg;
        }
    }
</style>