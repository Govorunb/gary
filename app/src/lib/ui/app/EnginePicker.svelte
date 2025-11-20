<script lang="ts">
    import { getSession, getUserPrefs } from '$lib/app/utils/di';
    import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
    import { CirclePlus, Settings2, ArrowLeft, Trash2, ChevronDown, Check } from '@lucide/svelte';
    import { getEngineConfigComponent } from './engines/EngineConfig.svelte';
    import { PressedKeys } from 'runed';
    import r from "$lib/app/utils/reporting";
    import { ENGINE_ID as RANDY_ID } from '$lib/app/engines/randy.svelte';
    import { ENGINE_ID as OPENROUTER_ID } from '$lib/app/engines/llm/openrouter.svelte';
    import { fade, fly } from 'svelte/transition';

    const session = getSession();
    const userPrefs = getUserPrefs();

    // UI state machine - null shows engine list
    let configEngineId: string | null = $state(null);
    let open = $state(false);
    const showingEngineList = $derived(open && !configEngineId);
    const engines = $derived(Object.entries(session.engines));
    const keys = new PressedKeys();
    const shiftPressed = $derived(keys.has('Shift')); // TODO: teach

    $effect(() => {
        // in traditional rx fashion, if you don't subscribe to a falling tree, it makes no sound
        // the consumer may not be rendered due to an {#if} (meaning it's not subscribed)
        // which makes the "delete" mode stuck even if you release shift
        void shiftPressed;
        if (!open) {
            closeConfig();
        }
    })
    keys.onKeys(['Control', 'e'], () => open = !open);
    // quick select
    for (let i = 1; i <= 9; i++) {
        keys.onKeys(i.toString(), () => {
            if (!showingEngineList) return;
            if (i > engines.length) return;
            selectEngine(engines[i - 1][0]);
            open = false;
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

    function openConfig(engineId: string) {
        configEngineId = engineId;
    }

    function closeConfig() {
        configEngineId = null;
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

<Dialog {open} onOpenChange={(d) => open = d.open}>
    <Dialog.Trigger>
        {#snippet element(props)}
            <button {...props} class="trigger">
                <span class="truncate max-w-96">{session.activeEngine.name}</span>
                <ChevronDown class="size-4 opacity-50" />
            </button>
        {/snippet}
    </Dialog.Trigger>
    <Portal>
        <Dialog.Backdrop class="fixed inset-0 bg-black/20 backdrop-blur-sm transition-opacity" />
        <Dialog.Positioner class="fixed inset-0 flex justify-center items-start pt-[15vh]">
            <Dialog.Content>
                <div class="popover-content" in:fly={{ y: 10, duration: 200 }} out:fade={{ duration: 150 }}>
                    {#if !configEngineId}
                        <div class="view-container" in:fly={{ x: -20, duration: 200, delay: 50 }} out:fade={{ duration: 150 }}>
                            <div class="header">
                                <h3>Select Engine</h3>
                                <p class="note">Ctrl+E</p>
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

                                        <div class="actions">
                                            <button class={["action-btn", del ? "delete" : "config"]}
                                                onclick={() => del ? deleteEngine(id) : openConfig(id)}
                                                title={del ? "Delete" : "Configure"}
                                            >
                                                <Icon class="size-4" />
                                            </button>
                                        </div>
                                    </div>
                                {/each}
                            </div>

                            <p class="note text-center">
                                Alt-click an engine to quickly open config.
                            </p>

                            <div class="footer">
                                <button class="add-button" onclick={createOpenAICompatible}>
                                    <CirclePlus class="size-4" />
                                    <span>Add OpenAI-compatible (Alt+A)</span>
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
            </Dialog.Content>
        </Dialog.Positioner>
    </Portal>
</Dialog>

<style lang="postcss">
    @reference "global.css";

    .trigger {
        @apply flex items-center gap-2 px-3 py-1.5 rounded-lg;
        @apply bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300;
        @apply dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:active:bg-neutral-600;
        @apply text-lg font-medium text-neutral-900 dark:text-neutral-100;
        @apply transition-all shadow-sm border border-neutral-200/50 dark:border-neutral-700/50;

        &:focus-visible {
            @apply ring-2 ring-primary-500 outline-none;
        }
    }

    .popover-content {
        @apply w-md max-w-[90vw] overflow-hidden;
        @apply bg-white dark:bg-surface-900;
        @apply rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800;
        @apply grid; /* Stack children */

        & > * {
            grid-area: 1 / 1;
        }
    }

    .view-container {
        @apply flex flex-col max-h-[70vh];
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

    .list {
        @apply flex flex-col p-2 gap-1 overflow-y-auto;
    }

    .engine-row {
        @apply flex items-center gap-1 p-1 rounded-lg transition-colors;
        @apply hover:bg-neutral-50 dark:hover:bg-surface-800;
    }

    .engine-select {
        @apply flex-1 flex items-center gap-3 px-2 py-1.5 rounded-md text-left;
        @apply text-sm font-medium text-neutral-700 dark:text-neutral-300;
        @apply outline-none;

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
        @apply size-5 rounded-full flex items-center justify-center border border-neutral-300 dark:border-neutral-600;
        @apply transition-colors;

        &.active {
            @apply bg-primary-500 border-primary-500 shadow-sm shadow-primary-500/30;
        }
    }

    .actions {
        @apply flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity px-1;
    }

    .action-btn {
        @apply p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100;
        @apply hover:bg-neutral-200 dark:hover:bg-surface-700 transition-colors;

        &.delete {
            @apply text-error-500 hover:text-error-600 hover:bg-error-50 dark:hover:bg-error-900/20;
        }
    }

    .footer {
        @apply p-2 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-surface-900/50;
    }

    .add-button {
        @apply w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg;
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
        @apply p-4 overflow-y-auto;
    }
</style>