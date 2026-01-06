<script lang="ts">
    import { getUpdater, getUserPrefs } from "$lib/app/utils/di";
    import Dialog from "$lib/ui/common/Dialog.svelte";
    import ThemePicker from "$lib/ui/common/ThemePicker.svelte";
    import { ExternalLink, X } from "@lucide/svelte";
    import Hotkey from "../common/Hotkey.svelte";
    import dayjs from "dayjs";
    import { app } from "@tauri-apps/api";
    import { APP_VERSION, clearLocalStorage, debounced, jsonParse, safeInvoke, safeParse } from "$lib/app/utils";
    import { ResultAsync } from "neverthrow";
    import { boolAttr } from "runed";

    type Props = {
        open: boolean;
    };

    let { open = $bindable() }: Props = $props();

    const userPrefs = getUserPrefs();
    const updater = getUpdater();

    let checking = $state(false);

    async function checkForUpdates() {
        if (checking) return;
        checking = true;
        await updater.checkForUpdates(true);
        checking = false;
        if (updater.hasPendingUpdate) {
            void updater.promptForUpdate();
        }
    }

    const lastCheckedAt = $derived.by(() => {
        const ts = userPrefs.app.updates.lastCheckedAt;
        if (!ts) return "never";
        let date = dayjs(ts);
        return `${date.fromNow()} (${date.format("YYYY-MM-DD")})`;
    });

    function resetSkipVersion() {
        userPrefs.app.updates.skipUpdateVersion = undefined;
        void checkForUpdates();
    }

    async function exportPrefs() {
        await navigator.clipboard.writeText(JSON.stringify(userPrefs.data));
        setBackupFeedback('success', "Copied to clipboard");
    }

    async function importPrefs() {
        ResultAsync.fromPromise(navigator.clipboard.readText(), () => "Could not read clipboard")
            .andThen(text => jsonParse(text).mapErr(e => e.message))
            .andThen(json => userPrefs.importData(json))
            .match(
                () => setBackupFeedback('success', "Imported successfully"),
                (e) => setBackupFeedback('error', `Failed to import: ${e}`),
            );
    }

    function dismissStatus() {
        prefsBackupFeedback = '';
    }

    function setBackupFeedback(status: typeof prefsBackupStatus, text: string) {
        prefsBackupStatus = status;
        prefsBackupFeedback = text;
    }

    let prefsBackupFeedback = $state('');
    let prefsBackupStatus = $state<'success' | 'error'>('success');
    let clearStatus = debounced(() => prefsBackupFeedback = '', 2000);
    $effect(() => {
        if (prefsBackupFeedback === '') {
            clearStatus.cancel();
        } else {
            clearStatus();
        }
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
                {#each [
                    GeneralSection,
                    UpdatesSection,
                    PreferencesSection,
                    TroubleshootingSection,
                ] as section}
                    <div class="settings-section">
                        {@render section()}
                    </div>
                {/each}
            </div>

            {#snippet GeneralSection()}
                <p class="section-title">General</p>

                <div class="field">
                    <p class="field-label">Theme</p>
                    <ThemePicker bind:currentTheme={userPrefs.app.theme} />
                </div>
            {/snippet}

            {#snippet PreferencesSection()}
                <p class="section-title">Preferences</p>

                <div class="preferences-layout">
                    <div class="flex flex-col gap-2">
                        <p>Backup or restore preferences via clipboard:</p>
                        <div class="field">
                            <div class="flex flex-row gap-2">
                                <button class="btn preset-outlined-surface-300-700"
                                    onclick={exportPrefs}
                                >
                                    Export
                                </button>
                                <button class="btn preset-outlined-surface-300-700"
                                    onclick={importPrefs}
                                >
                                    Import
                                </button>
                            </div>
                            <p class="field-label">Raw JSON data</p>
                        </div>
                        {#if prefsBackupFeedback}
                            <div class="prefs-iex-status"
                                data-success={boolAttr(prefsBackupStatus === "success")}
                                data-error={boolAttr(prefsBackupStatus === "error")}
                            >
                                <div class="status-content">
                                    {prefsBackupFeedback}
                                </div>
                                {#if prefsBackupStatus === "error"}
                                    <button class="dismiss-btn" onclick={dismissStatus}>
                                        <X size={14} />
                                    </button>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </div>
            {/snippet}

            {#snippet UpdatesSection()}
                <p class="section-title">Updates</p>

                <div class="flex gap-2">
                    <p>Current version:
                    {#await app.getVersion()}
                        {APP_VERSION}
                    {:then v}
                        {v}
                    {:catch}
                        Big Dingus The {APP_VERSION}rd
                    {/await}
                    </p>
                </div>

                <div class="update-settings">
                    <p class="font-light">Automatically check for updates on app launch:</p>
                    <select class="update-select" bind:value={userPrefs.app.updates.autoCheckInterval}>
                        <option value="everyLaunch">Every launch</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="off">Never</option>
                    </select>
                </div>
                <div class="update-actions">
                    <button class="btn preset-outlined-surface-300-700"
                        onclick={checkForUpdates}
                        disabled={updater.checkingForUpdates}
                    >
                        Check now
                    </button>
                    <p class="note">Last checked: {lastCheckedAt}</p>
                </div>
                {#if updater.skipVersion}
                    <p class="note">
                        You skipped updating to version {updater.skipVersion}
                        <button onclick={resetSkipVersion}><X size="12" /></button>
                    </p>
                {/if}
            {/snippet}

            {#snippet TroubleshootingSection()}
                <p class="section-title">Troubleshooting</p>

                <div class="flex flex-row gap-2">
                    <button class="btn preset-outlined-surface-300-700"
                        onclick={() => safeInvoke("open_logs_folder")}
                    >
                        Open logs folder <ExternalLink size=20 />
                    </button>
                    <button class="btn preset-tonal-error"
                        onclick={clearLocalStorage}
                    >
                        Reset app preferences
                    </button>
                </div>
            {/snippet}
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

    .field {
        @apply flex items-center gap-3;
    }

    .preferences-layout {
        @apply flex flex-col gap-2;
    }

    .field-label {
        @apply text-sm font-medium select-none;
        @apply text-neutral-700 dark:text-neutral-300;
    }
    .update-settings {
        @apply flex flex-col gap-1;
    }

    .update-actions {
        @apply flex flex-row gap-2 items-center;
    }

    .update-select {
        @apply w-full px-3 py-2 pr-8 appearance-none;
        @apply border border-neutral-300 dark:border-neutral-600 rounded-lg;
        @apply bg-white dark:bg-neutral-800;
        @apply text-neutral-900 dark:text-neutral-100;
        @apply focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400;
        
        &:hover {
            @apply border-neutral-400 dark:border-neutral-500;
        }
        
        &::content, &::slotted {
            @apply rounded-lg;
        }
    }

    .prefs-iex-status {
        @apply text-xs rounded-md px-3 py-2;
        @apply border whitespace-pre-line;
        @apply transition-all duration-200;
        @apply flex items-start justify-between gap-2;

        &[data-error] {
            @apply bg-red-50 dark:bg-red-900/30;
            @apply border-red-200 dark:border-red-800;
            @apply text-red-700 dark:text-red-300;
        }

        &[data-success] {
            @apply bg-green-50 dark:bg-green-900/30;
            @apply border-green-200 dark:border-green-800;
            @apply text-green-700 dark:text-green-300;
        }
    }

    .status-content {
        @apply flex-1;
    }

    .dismiss-btn {
        @apply shrink-0 p-0.5 rounded;
        @apply hover:bg-black/5 dark:hover:bg-white/10;
        @apply transition-colors;
    }
</style>
