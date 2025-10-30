<script lang="ts">
    import { getSession, getUserPrefs } from '$lib/app/utils/di';
    import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
    import { Engine } from '$lib/app/engines/index.svelte';
    import { CirclePlus, Cog } from '@lucide/svelte';

    const session = getSession();
    const userPrefs = getUserPrefs();

    let engines = $derived(Object.entries(session.engines));

    function createOpenAICompatible() {
        const id = session.initEngine();
        selectEngine(id);
        (document.activeElement as HTMLButtonElement)?.blur();
    }
    function selectEngine(id: string) {
        userPrefs.app.selectedEngine = id;
    }
</script>

<Popover>
    <Popover.Trigger>
        <button class="trigger">{session.activeEngine.name}</button>
    </Popover.Trigger>
    <Portal>
        <Popover.Positioner>
            <Popover.Content>
                <!-- list of rows for each engine (active highlighted and unclickable) -->
                <!-- last row is a button to add new engine -->
                <!-- essentially a radio button (/app/src/lib/ui/common/RadioButtons.svelte) but:
                    - vertical
                    - the last option changes the items array
                -->
                <div class="popover-content">
                    {#snippet engineButton(id: string, engine: Engine<any>)}
                        <div class="row">
                            <button class="item"
                                onclick={() => selectEngine(id)}
                                class:active={session.activeEngine.id === id}
                                disabled={session.activeEngine.id === id}
                            >
                                {engine.name}
                            </button>
                            <!-- TODO: config button that opens another popover -->
                            <button class="config">
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

</style>