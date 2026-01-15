<script lang="ts">
    import { getSession, getUserPrefs, getUIState } from '$lib/app/utils/di';
    import Dialog from '$lib/ui/common/Dialog.svelte';
    import ShiftIndicator from '$lib/ui/common/ShiftIndicator.svelte';
    import { CirclePlus, Settings2, ArrowLeft, Trash2, ChevronDown, Check } from '@lucide/svelte';
    import { getEngineConfigComponent } from './EngineConfig.svelte';
    import { PressedKeys } from 'runed';
    import r from "$lib/app/utils/reporting";
    import { ENGINE_ID as RANDY_ID } from '$lib/app/engines/randy.svelte';
    import { ENGINE_ID as OPENROUTER_ID } from '$lib/app/engines/llm/openrouter.svelte';
    import { fade, fly } from 'svelte/transition';
    import TeachingTooltip from '$lib/ui/common/TeachingTooltip.svelte';
    import Hotkey from '$lib/ui/common/Hotkey.svelte';
    import { registerAppHotkey } from '$lib/app/utils/hotkeys.svelte';

    const session = getSession();
    const userPrefs = getUserPrefs();
    const uiState = getUIState();

    const dialogs = uiState.dialogs;
    const showingEngineList = $derived(dialogs.enginePickerState === true);
    // UI state machine - null shows engine list
    const configEngineId: string | null = $derived(
        typeof dialogs.enginePickerState === "string"
            ? dialogs.enginePickerState
            : null
    );
    const engines = $derived(Object.entries(session.engines));
    const keys = new PressedKeys();
    const shiftPressed = $derived(keys.has('Shift'));

    registerAppHotkey(['Control', 'E'], () => toggleOpen());
    // quick select
    for (let i = 1; i <= 9; i++) {
        keys.onKeys(i.toString(), () => {
            if (!showingEngineList) return;
            if (i > engines.length) return;
            selectEngine(engines[i - 1][0]);
            dialogs.closeEnginePicker();
        });
    }
    keys.onKeys(['Alt', 'a'], () => {
        if (!showingEngineList) return;
        createOpenAICompatible();
    });

    function createOpenAICompatible() {
        const id = session.initEngine();
        selectEngine(id);
        openConfig(id);
    }

    function selectEngine(id: string) {
        userPrefs.app.selectedEngine = id;
    }

    function toggleOpen() {
        if (dialogs.enginePickerState) {
            dialogs.closeEnginePicker();
        } else {
            dialogs.openEnginePicker();
        }
    }

    function openConfig(engineId: string) {
        dialogs.enginePickerState = engineId;
    }

    function closeConfig() {
        dialogs.enginePickerState = true;
    }

    function canDelete(id: string) {
        return id !== RANDY_ID && id !== OPENROUTER_ID;
    }

    function deleteEngine(id: string) {
        if (!canDelete(id)) {
            r.error(`Cannot delete engine ${id}`);
            return;
        }
        if (id === session.activeEngine.id) {
            selectEngine(RANDY_ID);
        }
        session.deleteEngine(id);
    }

    function clickEngine(e: MouseEvent, id: string) {
        if (e.altKey) {
            openConfig(id);
        } else {
            selectEngine(id);
        }
    }
</script>

<Dialog bind:open={() => Boolean(dialogs.enginePickerState), (v) => dialogs.enginePickerState = v} position="top-start">
    {#snippet trigger(props)}
        <button {...props} class="trigger">
            <span class="truncate max-w-96">{session.activeEngine.name}</span>
            <ChevronDown class="size-4 opacity-50" />
        </button>
    {/snippet}
    {#snippet content(props)}
        <div {...props} class="engine-picker-content">
            {#if !configEngineId}
                <div class="view-container" in:fly={{ x: -20, duration: 200, delay: 50 }} out:fade={{ duration: 150 }}>
                    <div class="header">
                        <h3>Select Engine</h3>
                        <div class="header-actions">
                            <ShiftIndicator />
                            <TeachingTooltip>
                                <p><Hotkey>Ctrl+E</Hotkey> to open/close engine picker.</p>
                                <p><Hotkey>1..9</Hotkey> to quick-select engine.</p>
                                <p><Hotkey>Alt-click</Hotkey> an engine to quickly open config.</p>
                                <p><Hotkey>Alt+A</Hotkey> to create a custom OpenAI-compatible engine.</p>
                                <p>Hold <Hotkey>Shift</Hotkey> to reveal delete buttons. (OpenAI-compatible only)</p>
                            </TeachingTooltip>
                        </div>
                    </div>

                    <div class="list">
                        {#each engines as [id, engine], i (id)}
                            {@const active = session.activeEngine.id === id}
                            {@const del = shiftPressed && canDelete(id)}
                            {@const Icon = del ? Trash2 : Settings2}

                            <div class="engine-row group" title="ID: {id}">
                                <button
                                    class="engine-select"
                                    class:active={active}
                                    onclick={(e) => clickEngine(e, id)}
                                >
                                    <div class="status-indicator" class:active={active}>
                                        {#if active}
                                            <Check class="size-3 text-white" />
                                        {:else if i + 1 < 10}
                                            {i + 1}
                                        {/if}
                                    </div>
                                    <span class="name">{engine.name}</span>
                                </button>

                                <div class="actions" data-shift={shiftPressed}>
                                    <button
                                        class="action-btn"
                                        class:delete={del}
                                        class:config={!del}
                                        onclick={() => del ? deleteEngine(id) : openConfig(id)}
                                        title={del ? "Delete" : "Configure"}
                                    >
                                        <Icon class="size-4" />
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>

                    <div class="footer">
                        <button class="add-button" onclick={createOpenAICompatible}>
                            <CirclePlus class="size-4" />
                            <span>Add OpenAI-compatible</span>
                        </button>
                    </div>
                </div>
            {:else}
                <div class="view-container" in:fly={{ x: 20, duration: 200, delay: 50 }} out:fade={{ duration: 150 }}>
                    <div class="header with-back">
                        <button class="back-btn" onclick={closeConfig}>
                            <ArrowLeft class="size-5" />
                        </button>
                        <h3>{session.engines[configEngineId].name}</h3>
                        <div class="w-8"><!-- spacer --></div>
                    </div>
                    <div class="config-body">
                        {#if configEngineId && session.engines[configEngineId]}
                            {@const ConfigComponent = getEngineConfigComponent(configEngineId)}
                            <ConfigComponent engineId={configEngineId} close={closeConfig} />
                        {:else}
                            <p class="text-neutral-500 p-4">Internal error: Engine {configEngineId} not found</p>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .trigger {
        @apply frow-2 items-center px-3 py-1.5 rounded-lg;
        @apply text-lg font-medium text-neutral-900 dark:text-neutral-100;
        @apply transition-all shadow-sm border border-neutral-200/50 dark:border-neutral-700/50;
        @apply bg-neutral-100 active:bg-neutral-300;
        @apply dark:bg-neutral-800 dark:active:bg-neutral-600;

        &:hover {
            @apply bg-neutral-200 dark:bg-neutral-700;
        }

        &:focus-visible {
            @apply ring-2 ring-primary-500 outline-none;
        }
    }

    .engine-picker-content {
        @apply w-md overflow-hidden;
        @apply bg-white dark:bg-surface-900;
        @apply rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800;
        @apply grid; /* Stack children */

        & > * {
            grid-area: 1 / 1;
        }
    }

    .view-container {
        @apply fcol-0 max-h-[70vh];
    }

    .header {
        @apply flex items-center justify-between px-4 py-3 border-b border-neutral-100 dark:border-neutral-800;

        & h3 {
            @apply text-base font-semibold text-neutral-900 dark:text-neutral-100;
        }

        &.with-back {
            @apply gap-2;
        }
    }

    .header-actions {
        @apply frow-2 items-center;
    }

    .list {
        @apply fcol-scroll-1 p-2;
    }

    .engine-row {
        @apply flex items-center p-1 rounded-lg transition-colors;
        @apply hover:bg-neutral-50 dark:hover:bg-surface-800;
    }

    .engine-select {
        @apply flex-1 frow-3 items-center px-2 py-1.5 rounded-md text-left;
        @apply text-sm font-medium text-neutral-700 dark:text-neutral-300 outline-none;

        &.active {
            @apply text-neutral-900 dark:text-white;
        }

        &:focus-visible {
            @apply bg-neutral-100 dark:bg-surface-700;
        }
    }

    .name {
        @apply truncate max-w-64;
    }

    .status-indicator {
        @apply size-5 rounded-full flex items-center justify-center;
        @apply border border-neutral-300 dark:border-neutral-600;
        @apply transition-colors;

        &.active {
            @apply bg-primary-500 border-primary-500 shadow-sm shadow-primary-500/30;
        }
    }

    .actions {
        @apply flex items-center transition-opacity;
        @apply opacity-0 group-hover:opacity-100 focus-within:opacity-100;
        @apply data-[shift=true]:opacity-100;
    }

    .action-btn {
        @apply p-2 rounded-md text-neutral-400 transition-colors;

        &:hover {
            @apply text-neutral-900 dark:text-neutral-100;
            @apply bg-neutral-200 dark:bg-surface-700;
        }

        &.delete {
            @apply text-error-500;

            &:hover {
                @apply text-error-600 bg-error-50 dark:bg-error-900/20;
            }
        }
    }

    .footer {
        @apply p-2 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-surface-900/50;
    }

    .add-button {
        @apply w-full frow-2 items-center justify-center px-3 py-2 rounded-lg;
        @apply border border-dashed border-neutral-300 dark:border-neutral-700;
        @apply text-sm font-medium text-neutral-500 dark:text-neutral-400;
        @apply transition-all;

        &:hover {
            @apply bg-white dark:bg-surface-800;
            @apply text-primary-500 dark:text-primary-400;
            @apply border-primary-300 dark:border-primary-700;
        }
    }

    .back-btn {
        @apply p-1 -ml-1 rounded-md text-neutral-500 transition-colors;

        &:hover {
            @apply bg-neutral-100 dark:bg-surface-800;
            @apply text-neutral-900 dark:text-neutral-100;
        }
    }

    .config-body {
        @apply fcol-2 flex-1 overflow-hidden;
    }
</style>
