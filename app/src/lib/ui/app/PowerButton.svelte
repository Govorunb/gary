<script lang="ts">
    import { SERVER_MANAGER, type ServerManager } from "$lib/app/server.svelte";
    import { injectAssert } from "$lib/app/utils/di";
    import ServerConfig from "./ServerConfig.svelte";
    import { CirclePower, SlidersHorizontal } from "@lucide/svelte";
    import { Popover, Portal } from "@skeletonlabs/skeleton-svelte";

    let manager = injectAssert<ServerManager>(SERVER_MANAGER);

    let running = $derived(manager.running);
    let configDisabled = $derived(running);

    let powerBtnTooltip = $derived(running ? "Stop server" : "Start server");
    let optionsBtnTooltip = $derived(configDisabled ? "Server is running" : "Server options");

    async function togglePower() {
        await manager.toggle();
    }
</script>

<div class="flex flex-row items-center gap-3">
    <div class="power-button-container">
        <button
            class="power-button"
            data-running={running}
            onclick={togglePower}
            aria-label={powerBtnTooltip}
            title={powerBtnTooltip}
        >
            <CirclePower size={40} color={running ? "#0f9d58" : "#d93025"} class="pointer-events-none" />
        </button>
        <Popover>
            <Popover.Trigger>
                {#snippet element(props)}
                    <button {...props}
                        class="options-button"
                        disabled={configDisabled}
                        title={optionsBtnTooltip}
                        aria-label={optionsBtnTooltip}
                        >
                        <SlidersHorizontal size=20 class="pointer-events-none" />
                    </button>
                {/snippet}
            </Popover.Trigger>
            <Portal>
                <Popover.Positioner class="z-20!">
                    <Popover.Content>
                        <div class="popover-content">
                            <ServerConfig />
                            <div class="popover-arrow">
                                <Popover.Arrow>
                                    <Popover.ArrowTip />
                                </Popover.Arrow>
                            </div>
                        </div>
                    </Popover.Content>
                </Popover.Positioner>
            </Portal>
        </Popover>
    </div>
    {#if running}
        <p class="text-sm">Server is running on port {manager.port}</p>
    {:else}
        <p class="text-sm">Server is not running</p>
    {/if}
</div>

<style lang="postcss">
    @reference "tailwindcss";
    @reference "@skeletonlabs/skeleton";
    @reference "@skeletonlabs/skeleton-svelte";
    @reference "@skeletonlabs/skeleton/themes/cerberus";

    .power-button-container {
        @apply relative flex items-center gap-2 rounded-xl px-2 py-0.5
        max-h-10
        bg-neutral-200/80 dark:bg-neutral-800/80;
    }

    .power-button {
        @apply flex items-center justify-center rounded-full
            bg-neutral-100 shadow-inner transition-all duration-150
            size-13
            hover:scale-101 active:scale-99
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900
            dark:bg-neutral-800 dark:focus-visible:ring-offset-neutral-100;
        &[data-running="true"] {
            @apply ring-emerald-400/70 focus-visible:ring-emerald-300;
        }
    
        &[data-running="false"] {
            @apply ring-rose-500/70 focus-visible:ring-rose-300;
        }
    }


    .options-button {
        @apply flex size-8 items-center justify-center rounded-full border border-transparent
            bg-neutral-200/80 text-neutral-700 shadow-sm transition hover:bg-neutral-200
            disabled:cursor-not-allowed disabled:opacity-60
            dark:bg-neutral-800/70 dark:text-neutral-200 dark:hover:bg-neutral-800;
    }

    .popover-arrow {
        --arrow-size: calc(var(--spacing) * 4);
        --arrow-background: var(--color-neutral-800);
    }

    .popover-content {
        @apply relative left-0 top-full z-10 flex min-w-fit flex-col gap-3 rounded-xl;
        @apply bg-neutral-800 border border-neutral-700 p-5 text-sm text-neutral-50 shadow-xl ring-1 ring-neutral-800;
    }

    .popover-header {
        @apply flex items-center justify-between gap-3 text-base font-semibold;
    }
</style>