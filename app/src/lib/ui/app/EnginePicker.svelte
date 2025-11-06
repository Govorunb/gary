<script lang="ts">
    import { getSession, getUserPrefs } from '$lib/app/utils/di';
    import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
    import { Engine } from '$lib/app/engines/index.svelte';
    import { CirclePlus, Cog, ArrowLeft } from '@lucide/svelte';
    import EngineConfig from './EngineConfig.svelte';

    const session = getSession();
    const userPrefs = getUserPrefs();

    let engines = $derived(Object.entries(session.engines));
    let selectedEngineId: string | null = $state(null);
    let configState: 'list' | 'config' = $derived(selectedEngineId != null ? 'config' : 'list');

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
</script>

<Popover>
    <Popover.Trigger>
        <button class="trigger">{session.activeEngine.name}</button>
    </Popover.Trigger>
    <Portal>
        <Popover.Positioner>
            <Popover.Content>
                <div class="popover-content">
                    {#if configState === 'list'}
                        <!-- Engine List View -->
                        <div class="list-header">
                            <h3>Select Engine</h3>
                        </div>
                        {#snippet engineButton(id: string, engine: Engine<any>)}
                            <div class="row">
                                <button class="item"
                                    onclick={(e) => handleEngineClick(id, e)}
                                    class:active={session.activeEngine.id === id}
                                    disabled={session.activeEngine.id === id}
                                >
                                    {engine.name}
                                </button>
                                <button class="config" onclick={() => openConfig(id)}>
                                    <Cog />
                                </button>
                            </div>
                        {/snippet}
                        {#each engines as [id, engine] (id)}
                            {@render engineButton(id, engine)}
                        {/each}
                        <button class="item add-new" onclick={createOpenAICompatible}>
                            <CirclePlus />
                            <span>Add OpenAI-compatible server</span>
                        </button>
                    {:else if configState === 'config'}
                        <!-- Engine Config View -->
                        <div class="config-header">
                            <button class="back-button" onclick={closeConfig}>
                                <ArrowLeft />
                            </button>
                            <h3>Configure Engine</h3>
                        </div>
                        <div class="config-content">
                            {#if selectedEngineId && session.engines[selectedEngineId]}
                                <p>Config for: {session.engines[selectedEngineId].name}</p>
                                <EngineConfig engineId={selectedEngineId} onClose={closeConfig} />
                            {:else}
                                <p>Engine not found</p>
                            {/if}
                        </div>
                    {/if}
                </div>
            </Popover.Content>
        </Popover.Positioner>
    </Portal>
</Popover>

<style lang="postcss">
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";

    .trigger {
        @apply text-3xl font-semibold;
        @apply bg-secondary-400 border-none rounded-md p-2;
        @apply focus:ring-2 focus:ring-primary-500;
    }

    .popover-content {
        @apply flex flex-col gap-2 bg-surface-200-800/85 p-4 max-h-[calc(100vh-8em)] overflow-scroll;
        @apply rounded-lg;
        @apply border-2 min-w-100 border-neutral-900/30;
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
        @apply focus:ring-2 focus:ring-primary-500;
        @apply dark:bg-primary-200 dark:text-primary-900;
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
    
    .add-new {
        @apply text-sm font-semibold rounded-md;
        @apply flex flex-row gap-2;
    }

    .list-header {
        @apply mb-4;
    }

    .list-header h3 {
        @apply text-lg font-semibold;
    }

    .config-header {
        @apply flex items-center gap-2 mb-4;
    }

    .config-header h3 {
        @apply text-lg font-semibold;
    }

    .back-button {
        @apply p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700;
    }

    .config-content {
        @apply flex flex-col gap-4;
    }

</style>