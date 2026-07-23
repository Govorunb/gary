<script lang="ts">
    import { getUpdater, getUserPrefs } from "$lib/app/utils/di";
    import Dialog from "$lib/ui/common/Dialog.svelte";
    import ThemePicker from "$lib/ui/common/ThemePicker.svelte";
    import { ExternalLink, X } from "@lucide/svelte";
    import Hotkey from "../common/Hotkey.svelte";
    import dayjs from "dayjs";
    import { app } from "@tauri-apps/api";
    import { APP_VERSION, clearLocalStorage, debounced, isApril1st, jsonParse, safeInvoke } from "$lib/app/utils";
    import { ResultAsync } from "neverthrow";
    import { boolAttr, TextareaAutosize } from "runed";
    import OutLink from "../common/OutLink.svelte";
    import Switch from "$lib/ui/common/Switch.svelte";
    import TeachingTooltip from "../common/TeachingTooltip.svelte";

    type Props = {
        open: boolean;
    };

    let { open = $bindable() }: Props = $props();

    const userPrefs = getUserPrefs();
    const updater = getUpdater();
    const characterPresets = {
        neuro: "Neuro-sama",
        evil: "Evil Neuro",
        gary: "Gary",
        tony: "Tony",
        jippity: "Jippity",
    } as const;
    type CharacterPreset = keyof typeof characterPresets;

    function characterPresetKey() {
        const { characterId, displayName } = userPrefs.app.character;
        if (!(characterId in characterPresets)) return "custom";

        const presetKey = characterId as CharacterPreset;
        return characterPresets[presetKey] === displayName ? presetKey : "custom";
    }

    let selectedCharacterPreset = $state(characterPresetKey());

    function setCharacterPreset(value: string) {
        if (!(value in characterPresets)) return;

        const presetKey = value as CharacterPreset;
        userPrefs.app.character.characterId = presetKey;
        userPrefs.app.character.displayName = characterPresets[presetKey];
    }

    let sysPromptTextArea = $state<HTMLTextAreaElement>(null!);
    let userInstructions = $state(userPrefs.app.systemPrompt ?? "");
    new TextareaAutosize({
        element: () => sysPromptTextArea,
        input: () => userInstructions,
        maxHeight: 300, // hack but the 'right' way (multiple of line-height) isn't obvious rn
    });
    $effect(() => {
        if (!open) return;
        userInstructions = userPrefs.app.systemPrompt ?? "";
    });

    function saveUserInstructions() {
        if (userInstructions === (userPrefs.app.systemPrompt ?? "")) return;
        userPrefs.app.systemPrompt = userInstructions;
    }

    async function checkForUpdates() {
        if (updater.checkingForUpdates) return;
        await updater.checkForUpdates(true);
    }

    const lastCheckedAt = $derived.by(() => {
        const ts = userPrefs.app.updates.lastCheckedAt;
        if (!ts) return "never";
        let date = dayjs(ts);
        return `${date.fromNow()} (${date.format("YYYY-MM-DD")})`;
    });

    function resetSkipVersion() {
        userPrefs.app.updates.skipUpdateVersion = undefined;
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
    {#snippet title()}
        <h3>Settings</h3>
        <Hotkey>Ctrl+,</Hotkey>
    {/snippet}
    {#snippet body()}
        <div class="dialog-body-scroll">
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
            <h2>General</h2>

            <div class="field">
                <p class="field-label">Theme</p>
                <ThemePicker bind:currentTheme={userPrefs.app.theme} />
            </div>
            <div class="field">
                <div class="field-heading">
                    <span id="hide-sensitive-info-label" class="field-label">Hide sensitive info</span>
                    <TeachingTooltip>
                        <p>Blur potentially sensitive event data in the event log</p>
                    </TeachingTooltip>
                    <Switch
                        bind:checked={userPrefs.app.hideSensitiveInfo}
                        aria-labelledby="hide-sensitive-info-label"
                    />
                </div>
            </div>
            <div class="field stacked">
                <label class="field-label" for="action-list-density">Action list density</label>
                <select
                    id="action-list-density"
                    class="settings-select"
                    bind:value={userPrefs.app.actionListDensity}
                >
                    <option value="default">Default</option>
                    <option value="compact">Compact</option>
                </select>
            </div>
            <div class="field stacked">
                <div class="field-heading">
                    <label class="field-label" for="character-preset">Startup character</label>
                    <TeachingTooltip>
                        <p>
                            The character to report to the game (see <OutLink href="https://github.com/VedalAI/neuro-sdk/blob/6a0e104e72805fc0b63bc9713ce06d9dfda0873e/API/SPECIFICATION.md#startup-acknowledgement">API reference</OutLink>)
                        </p>
                    </TeachingTooltip>
                </div>
                <select
                    id="character-preset"
                    class="settings-select"
                    bind:value={selectedCharacterPreset}
                    onchange={(e) => setCharacterPreset((e.target as HTMLSelectElement).value)}
                >
                    {#each Object.entries(characterPresets) as [key, label]}
                        <option value={key}>{label}</option>
                    {/each}
                    <option value="custom">Custom</option>
                </select>
                {#if selectedCharacterPreset === "custom"}
                    <div class="custom-character-fields">
                        <label class="field-label" for="character-id">Character ID</label>
                        <input
                            id="character-id"
                            class="settings-input"
                            bind:value={userPrefs.app.character.characterId}
                        />
                        <label class="field-label" for="display-name">Display name</label>
                        <input
                            id="display-name"
                            class="settings-input"
                            bind:value={userPrefs.app.character.displayName}
                        />
                    </div>
                {/if}
            </div>
            <div class="field stacked">
                <div class="field-heading">
                    <label class="field-label" for="user-instructions">User instructions</label>
                    <TeachingTooltip>
                        <p>
                            Additional instructions to give to the LLM. Always in-context as part of the system prompt.
                            <br>
                            Keep in mind, you don't have this option with Neuro! At most you should only use it to try and match her personality, don't try to explain your game in there.
                        </p>
                    </TeachingTooltip>
                </div>
                <textarea
                    bind:value={userInstructions}
                    bind:this={sysPromptTextArea}
                    class="input-field"
                    id="user-instructions"
                    onblur={saveUserInstructions}
                ></textarea>
            </div>
            {#if isApril1st()}
                <div class="field">
                    <Switch bind:checked={() => !userPrefs.app.joyless, (v) => userPrefs.app.joyless = !v}>
                        <p class="field-label">Joy and whimsy</p>
                    </Switch>
                </div>
            {/if}
        {/snippet}

        {#snippet PreferencesSection()}
            <h2>Preferences</h2>

            <div class="fcol-2">
                <div class="fcol-2">
                    <p>Backup/restore raw JSON data to/from clipboard:</p>
                    <div class="field">
                        <div class="frow-2">
                            <button class="btn btn-base preset-outlined-surface-300-700"
                                onclick={exportPrefs}
                            >
                                Export data
                            </button>
                            <button class="btn btn-base preset-outlined-surface-300-700"
                                onclick={importPrefs}
                            >
                                Import data
                            </button>
                        </div>
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
                    <p class="note whitespace-pre-line">
                        Your preferences data may contain sensitive information.
                        Please think twice before sharing it.
                    </p>
                </div>
            </div>
        {/snippet}

        {#snippet UpdatesSection()}
            <h2>Updates</h2>

            <div class="frow-2">
                <p>Current version:
                {#await app.getVersion()}
                    {APP_VERSION}
                {:then v}
                    {v}
                {:catch}
                    {#if !userPrefs.app.joyless}
                        Big Dingus The {APP_VERSION}{APP_VERSION.endsWith('3') ? 'th' : 'rd'}
                    {:else}
                        {APP_VERSION}
                    {/if}
                {/await}
                (<OutLink href="https://github.com/Govorunb/gary/releases/v{APP_VERSION}">release notes</OutLink>)
                </p>
            </div>

            <div class="fcol-1">
                <p class="font-light">Automatically check for updates on app launch:</p>
                <select class="settings-select" bind:value={userPrefs.app.updates.autoCheckInterval}>
                    <option value="everyLaunch">Every launch</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="off">Never</option>
                </select>
            </div>
            <div class="frow-2 items-center">
                <button class="btn btn-base preset-outlined-surface-300-700"
                    onclick={checkForUpdates}
                    disabled={updater.checkingForUpdates}
                >
                    {#if updater.checkingForUpdates}
                        Checking...
                    {:else}
                        Check now
                    {/if}
                </button>
                <p class="note">Last checked: {lastCheckedAt}</p>
            </div>
            {#if updater.skipVersion}
                <p class="note">
                    You skipped updating to version {updater.skipVersion}
                    <button onclick={resetSkipVersion} title="Remove skip"><X size="12" /></button>
                </p>
            {/if}
            {#if updater.lastCheckResult}
                {@const update = updater.update}
                {@const err = updater.lastCheckResult.isErr() && updater.lastCheckResult.error}
                {@const skipped = update && update.version === updater.skipVersion}
                <div class="callout" class:warn={err} class:success={update} class:note={skipped}>
                    <p class="text-xs">
                        {#if update}
                            {#if skipped}
                                Version {update.version} is available, but it was previously skipped.
                            {:else}
                                <span class="text-sm frow-2 items-center">
                                    Version {update.version} is available!
                                    <button class="btn btn-base preset-outlined-surface-300-700"
                                        onclick={() => updater.promptForUpdate()}
                                    >
                                        See more
                                    </button>
                                </span>
                            {/if}
                        {:else}
                            {#if err}
                                <span class="fcol-1">
                                    <b class="text-sm">Could not check for updates</b>
                                    {err}
                                </span>
                            {:else}
                                No update found.
                            {/if}
                        {/if}
                    </p>
                </div>
            {/if}
        {/snippet}

        {#snippet TroubleshootingSection()}
            <h2>Troubleshooting</h2>

            <div class="row">
                <button class="btn btn-base preset-outlined-surface-300-700"
                    onclick={() => safeInvoke("open_logs_folder")}
                >
                    Open logs folder <ExternalLink size=20 />
                </button>
                <button class="btn btn-base preset-tonal-error"
                    onclick={clearLocalStorage}
                >
                    Reset app preferences
                </button>
            </div>
        {/snippet}
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .dialog-body-scroll {
        @apply fcol-3 flex-1 overflow-y-auto;
    }

    .settings-section {
        @apply fcol-3;
        @apply p-4 rounded-lg;
        @apply bg-surface-50 dark:bg-surface-800;
        @apply border border-neutral-200 dark:border-neutral-700;
    }

    .field {
        @apply frow-3 items-center;

        &.stacked {
            @apply fcol-2 items-stretch;
        }
    }

    .field-label {
        @apply text-sm font-medium select-none;
        @apply text-neutral-700 dark:text-neutral-300;
    }

    .field-heading {
        @apply inline-flex items-center gap-1.5;
    }

    .settings-select,
    .settings-input {
        @apply w-full px-3 py-2 pr-8 appearance-none;
        @apply border border-neutral-300 dark:border-neutral-600 rounded-lg;
        @apply bg-white dark:bg-neutral-800;
        @apply text-neutral-900 dark:text-neutral-100;
        @apply focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400;

        &:hover {
            @apply border-neutral-400 dark:border-neutral-500;
        }
    }

    .input-field {
        @apply rounded-md px-3 py-2 text-sm;
        @apply bg-white border border-neutral-300;
        @apply dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-100;
        @apply focus:outline-none focus:ring-2 focus:ring-primary-500;
    }

    .settings-input {
        @apply pr-3;
    }

    .custom-character-fields {
        @apply grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 items-center;
        @apply p-3 rounded-md;
        @apply bg-neutral-50 dark:bg-neutral-900/30;
        @apply border border-neutral-200 dark:border-neutral-700;
    }

    .prefs-iex-status {
        @apply text-xs rounded-md px-3 py-2;
        @apply border whitespace-pre-line;
        @apply transition-all duration-200;
        @apply frow-2 items-start justify-between;

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
</style>
