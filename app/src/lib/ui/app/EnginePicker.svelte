<script lang="ts">
    import { getOpenRouter, getRandy, getSession, getUserPrefs } from '$lib/app/utils/di';
    import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
    import { ENGINE_ID as RANDY_ID } from '$lib/app/engines/randy.svelte';
    import { ENGINE_ID as OPENROUTER_ID } from '$lib/app/engines/llm/openrouter.svelte';
    import { Engine } from '$lib/app/engines/index.svelte';
    import { Cog } from '@lucide/svelte';

    const session = getSession();
    const userPrefs = getUserPrefs();

    let engineEntries = $derived(Object.entries(session.customEngines));

    function createOpenAICompatible() {
        const id = session.initCustomEngine();
        selectEngine(id);
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
                    {@render engineButton(OPENROUTER_ID, getOpenRouter())}
                    {#each engineEntries as [id, engine]}
                        {@render engineButton(id, engine)}
                    {/each}
                    {@render engineButton(RANDY_ID, getRandy())}
                    <button class="item add-new" onclick={createOpenAICompatible}>
                        + Add OpenAI-compatible service
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
        @apply bg-primary-800 border-none rounded-md p-2;
        @apply focus:ring-2 focus:ring-primary-500;
    }

    .popover-content {
        @apply flex flex-col gap-2 bg-neutral-700 p-4 max-h-[calc(100vh-8em)] overflow-scroll;
        @apply rounded-lg;
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
            @apply bg-primary-300/80;
            @apply dark:bg-primary-600/80;
        }
        &:active:not(:disabled) {
            @apply bg-primary-800/80 text-primary-50;
            @apply dark:bg-primary-800/80 dark:text-primary-50;
        }
    }
    
    .config {
        @apply relative right-0;
        @apply rounded-r-md p-2;
        @apply bg-neutral-400 text-neutral-50;
    }
    
    .add-new {
        @apply text-sm font-normal rounded-md;
    }

</style>