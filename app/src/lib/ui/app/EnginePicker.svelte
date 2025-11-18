<script lang="ts">
    import { getSession, getUserPrefs } from '$lib/app/utils/di';
    import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
    import { Engine } from '$lib/app/engines/index.svelte';
    import { CirclePlus, Cog, ArrowLeft, Trash } from '@lucide/svelte';
    import EngineConfig from './EngineConfig.svelte';
    import { PressedKeys } from 'runed';
    import r from "$lib/app/utils/reporting";
    import { ENGINE_ID as RANDY_ID } from '$lib/app/engines/randy.svelte';
    import { ENGINE_ID as OPENROUTER_ID } from '$lib/app/engines/llm/openrouter.svelte';
    import { fade } from 'svelte/transition';

    const session = getSession();
    const userPrefs = getUserPrefs();

    let open = $state(false);
    let engines = $derived(Object.entries(session.engines));
    let selectedEngineId: string | null = $state(null);
    const keys = new PressedKeys();
    let shiftPressed = $derived(keys.has('Shift'));
    $effect(() => {
        // otherwise, it stops being updated on switching to config
        // which makes the "delete" mode stuck even if you release shift
        void shiftPressed;
        
        if (!open) {
            closeConfig();
        }
    })
    // TODO: teach hotkey
    keys.onKeys(['Control', 'e'], () => open = !open);

    function createOpenAICompatible() {
        const id = session.initEngine();
        selectEngine(id);
        (document.activeElement as HTMLButtonElement)?.blur();
    }

    function selectEngine(id: string) {
        userPrefs.app.selectedEngine = id;
    }

    function openConfig(engineId: string) {
        selectedEngineId = engineId;
    }

    function closeConfig() {
        selectedEngineId = null;
    }

    function handleEngineClick(engineId: string, event: MouseEvent) {
        if (event.altKey) {
            openConfig(engineId);
        } else {
            selectEngine(engineId);
            (document.activeElement as HTMLButtonElement)?.blur();
        }
    }

    function canDelete(id: string) {
        return id !== RANDY_ID && id !== OPENROUTER_ID
            && session.activeEngine.id !== id;
    }

    function deleteEngine(id: string) {
        if (!canDelete(id)) {
            r.error(`Cannot delete engine ${id}`);
            return;
        }
        session.deleteEngine(id);
    }
    function rightClick(e: MouseEvent) {
        e.preventDefault();
        openConfig(session.activeEngine.id);
        (e.target as HTMLButtonElement).click();
    }
</script>

<Dialog {open} onOpenChange={(d) => open = d.open}>
    <Dialog.Trigger>
        <button class="trigger" oncontextmenu={rightClick}>{session.activeEngine.name}</button>
    </Dialog.Trigger>
    <Portal>
        <Dialog.Backdrop class="fixed inset-0 bg-surface-50-950/50" />
        <Dialog.Positioner class="fixed inset-0 flex justify-center items-center">
            <Dialog.Content>
                <div class="popover-content">
                    {#if !selectedEngineId}
                        <div class="list-view">
                            <!-- Engine List View -->
                            <div class="list-header">
                                <h3>Select Engine</h3>
                            </div>
                            {#snippet engineRow(id: string, engine: Engine<any>)}
                                {@const del = shiftPressed && canDelete(id)}
                                {@const Icon = del ? Trash : Cog}
                                <div class="row" out:fade>
                                    <button class="item"
                                        onclick={(e) => handleEngineClick(id, e)}
                                        class:active={session.activeEngine.id === id}
                                        disabled={session.activeEngine.id === id}
                                        title={`ID: ${engine.id}`}
                                    >
                                        {engine.name}
                                    </button>
                                    <!-- two-in-one to preserve tab focus (otherwise you literally can't press this on keyboard) -->
                                    <button class={del ? "trash" : "config"} onclick={() => del ? deleteEngine(id) : openConfig(id)}>
                                        <Icon />
                                    </button>
                                </div>
                            {/snippet}
                            {#each engines as [id, engine] (id)}
                                {@render engineRow(id, engine)}
                            {/each}
                            <div class="row">
                                <button class="item add-new" onclick={createOpenAICompatible}>
                                    <CirclePlus />
                                    <span>Add OpenAI-compatible server</span>
                                </button>
                            </div>
                        </div>
                    {:else}
                        <div class="config-view">
                            <div class="config-header">
                                <button class="back-button" onclick={closeConfig}>
                                    <ArrowLeft />
                                </button>
                                <h3>{session.engines[selectedEngineId].name}</h3>
                            </div>
                            <div class="config-content">
                                {#if selectedEngineId && session.engines[selectedEngineId]}
                                    <EngineConfig engineId={selectedEngineId} onClose={closeConfig} />
                                {:else}
                                    <p>Engine not found</p>
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
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";
    @reference "@skeletonlabs/skeleton/themes/cerberus";

    .trigger {
        @apply text-3xl font-semibold;
        @apply bg-secondary-400 border-none rounded-md p-2;
        &:focus {
            @apply ring-2 ring-primary-500;
        }
    }

    .popover-content {
        @apply grid p-4 rounded-lg;
        & * { grid-area: 1 / 1; } /* list/config need to occupy the same space (otherwise they vertically stack on transition which looks awful) */
        @apply min-w-200 max-h-[calc(100vh-8em)] overflow-x-hidden overflow-y-scroll;
        @apply bg-surface-200-800/85;
        @apply border-2 border-neutral-900/30;
        /* real smarty pants behavior
        https://github.com/tailwindlabs/tailwindcss/issues/13844
        https://github.com/tauri-apps/tauri/issues/14040
        */
        -webkit-backdrop-filter: blur(2px);
    }

    .row {
        @apply flex min-h-12;
    }

    .item {
        @apply text-xl font-semibold flex-1;
        @apply bg-primary-700 border-r border-neutral-900/20 rounded-l-md p-2;
        @apply dark:bg-primary-200 dark:text-primary-900;
        &:focus {
            @apply ring-2 ring-primary-500;
        }
        &:hover:not(:disabled) {
            @apply bg-primary-300;
            @apply dark:bg-primary-600;
        }
        &:active:not(:disabled) {
            @apply bg-primary-800 text-primary-50;
            @apply dark:bg-primary-800 dark:text-primary-50;
        }
    }

    .config {
        @apply relative right-0;
        @apply rounded-r-md p-2;
        @apply bg-neutral-400 text-neutral-50;
    }

    .trash {
        @apply relative right-0;
        @apply rounded-r-md p-2;
        @apply bg-error-800 text-error-50;
    }

    .add-new {
        @apply text-sm font-semibold rounded-md;
        @apply flex flex-row gap-2 h-10 flex-none;
    }

    .list-view {
        @apply flex flex-col gap-2;
    }

    .list-header {
        @apply mb-4;
        & h3 {
            @apply text-lg font-semibold;
        }
    }

    .config-view {
        @apply flex flex-col gap-2;
    }

    .config-header {
        @apply flex items-center gap-2 mb-4;
        & h3 {
            @apply text-lg font-semibold;
        }
    }

    .back-button {
        @apply p-1 rounded;
        &:hover {
            @apply bg-neutral-200;
            @apply dark:bg-neutral-700;
        }
    }

    .config-content {
        @apply flex flex-col gap-4;
    }

</style>