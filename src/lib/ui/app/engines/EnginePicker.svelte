<script lang="ts">
    import { getSession, getUserPrefs, getUIState } from '$lib/app/utils/di';
    import Dialog from '$lib/ui/common/Dialog.svelte';
    import ShiftIndicator from '$lib/ui/common/ShiftIndicator.svelte';
    import { CirclePlus, Settings2, ArrowLeft, Trash2, ChevronDown, Check } from '@lucide/svelte';
    import { getEngineConfigComponent } from './EngineConfig.svelte';
    import { PressedKeys } from 'runed';
    import { ENGINE_ID as RANDY_ID } from '$lib/app/engines/randy.svelte';
    import { ENGINE_ID as OPENROUTER_ID } from '$lib/app/engines/llm/openrouter.svelte';
    import { fade, fly } from 'svelte/transition';
    import TeachingTooltip from '$lib/ui/common/TeachingTooltip.svelte';
    import Hotkey from '$lib/ui/common/Hotkey.svelte';
    import { registerAppHotkey } from '$lib/app/utils/hotkeys.svelte';
    import { toast } from 'svelte-sonner';

    const session = getSession();
    const userPrefs = getUserPrefs();
    const uiState = getUIState();

    const dialogs = uiState.dialogs;
    const showingEngineList = $derived(dialogs.activeDialog?.type === "enginePicker"
        && dialogs.activeDialog.engineId === null);
    const configEngineId: string | null = $derived(
        dialogs.activeDialog?.type === "enginePicker"
            ? dialogs.activeDialog.engineId
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
        if (dialogs.isOpen("enginePicker")) {
            dialogs.closeEnginePicker();
        } else {
            dialogs.openEnginePicker();
        }
    }

    function openConfig(engineId: string) {
        dialogs.openEngineConfig(engineId);
    }

    function closeConfig() {
        dialogs.openEnginePicker();
    }

    function canDelete(id: string) {
        return id !== RANDY_ID && id !== OPENROUTER_ID;
    }

    function deleteEngine(id: string) {
        if (!canDelete(id)) {
            toast.error(`Cannot delete engine ${id}`);
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

<Dialog
    bind:open={() => dialogs.isOpen("enginePicker"), (open) => open ? dialogs.openEnginePicker() : dialogs.closeEnginePicker()}
    position="top-start"
>
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
                            {const active = $derived(session.activeEngine.id === id)}
                            {const del = $derived(shiftPressed && canDelete(id))}
                            {const Icon = $derived(del ? Trash2 : Settings2)}

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
                                        class="icon-btn action-btn"
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
                        <button class="icon-btn" onclick={closeConfig} aria-label="Back">
                            <ArrowLeft class="size-5" />
                        </button>
                        <h3>{session.engines[configEngineId].name}</h3>
                        <div class="w-8"><!-- spacer --></div>
                    </div>
                    <div class="config-body">
                        {#if configEngineId && session.engines[configEngineId]}
                            {const ConfigComponent = $derived(getEngineConfigComponent(configEngineId))}
                            <ConfigComponent engineId={configEngineId} close={closeConfig} />
                        {:else}
                            <p class="text-ink-3 p-4">Internal error: Engine {configEngineId} not found</p>
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
        @apply frow-1.5 items-center h-8 px-2.5 rounded-md;
        @apply text-sm font-medium text-ink-1 transition-colors;
        &:hover {
            @apply text-ink-0;
            background-color: var(--color-bar-control);
        }
        &:focus-visible {
            @apply ring-2 ring-accent outline-none;
        }
    }

    .engine-picker-content {
        @apply w-md overflow-hidden;
        @apply bg-layer-1 rounded-2xl shadow-2xl ring-1 ring-edge;
        @apply grid; /* Stack children */
        & > * {
            grid-area: 1 / 1;
        }
    }

    .view-container {
        @apply fcol-0 max-h-[70vh];
    }

    .header {
        @apply flex items-center justify-between px-4 py-3 border-b border-edge;
        & h3 {
            @apply text-base font-semibold text-ink-0;
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
        &:hover { @apply bg-layer-2; }
    }

    .engine-select {
        @apply flex-1 frow-3 items-center px-2 py-1.5 rounded-md text-left;
        @apply text-sm font-medium text-ink-1 outline-none;
        &.active {
            @apply text-ink-0;
        }
        &:focus-visible {
            @apply ring-2 ring-accent;
        }
    }

    .name {
        @apply truncate max-w-64;
    }

    .status-indicator {
        @apply size-5 rounded-full flex items-center justify-center;
        @apply text-xs text-ink-2 ring-1 ring-inset ring-edge transition-colors;
        &.active {
            @apply bg-accent ring-accent;
        }
    }

    .actions {
        @apply flex items-center transition-opacity;
        @apply opacity-0 group-hover:opacity-100 focus-within:opacity-100;
        @apply data-[shift=true]:opacity-100;
    }

    .action-btn.delete {
        @apply text-lvl-err;
        &:hover {
            @apply text-lvl-err;
            background-color: color-mix(in oklab, var(--color-lvl-err) 14%, transparent);
        }
    }

    .footer {
        @apply p-2 border-t border-edge;
    }

    .add-button {
        @apply w-full frow-2 items-center justify-center px-3 py-2 rounded-lg;
        @apply border border-dashed border-edge;
        @apply text-sm font-medium text-ink-2 transition-colors;
        &:hover {
            @apply bg-layer-2 text-accent border-accent;
        }
        &:focus-visible {
            @apply outline-none ring-2 ring-accent;
        }
    }

    .config-body {
        @apply fcol-2 flex-1 overflow-hidden;
    }
</style>
