<script lang="ts">
    import { getUserPrefs, getServerManager } from "$lib/app/utils/di";
    import ServerConfig from "./ServerConfig.svelte";
    import { CirclePower, SlidersHorizontal } from "@lucide/svelte";
    import { Popover, Portal } from "@skeletonlabs/skeleton-svelte";
    import { boolAttr } from "runed";
    import r from "$lib/app/utils/reporting";

    let userPrefs = getUserPrefs();
    let manager = getServerManager();

    let running = $derived(manager.running);
    let configDisabled = $derived(running);

    let powerBtnTooltip = $derived(running ? "Stop server" : "Start server");
    let optionsBtnTooltip = $derived(configDisabled ? "Server is running" : "Server options");

    // TODO: shutting off with connected games should be a hold action (~1s) with Shift+Click bypass
    async function togglePower() {
        let res = await manager.toggle();
        if (res.isErr()) {
            let err_title = `Failed to ${running ? "stop" : "start"} server`;
            let err_msg = res.error;
            if (err_msg.includes("in use")) {
                err_msg = `The port ${userPrefs.server.port} is already in use. Check for other instances of Gary, Tony, etc.`;
            }
            r.error({
                message: err_title,
                toast: {
                    description: err_msg,
                    id: "server-start-error",
                },
                ctx: {error: res.error}
            });
        }
    }
</script>

<div class="flex flex-row items-center gap-3">
    <div class="power-button-container">
        <!-- TODO: see how theme colors look instead (surface/primary) -->
        <button
            class="power-button"
            data-running={boolAttr(running)}
            onclick={togglePower}
            aria-label={powerBtnTooltip}
            title={powerBtnTooltip}
        >
            <CirclePower size={40} class={["pointer-events-none", running ? "stroke-[#0f9d58]" : "stroke-[#d93025]"]} />
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
                            <Popover.Arrow class="global-popover-arrow">
                                <Popover.ArrowTip />
                            </Popover.Arrow>
                        </div>
                    </Popover.Content>
                </Popover.Positioner>
            </Portal>
        </Popover>
    </div>
    {#if running}
        <p class="text-sm">Server is running on port {userPrefs.server.port}</p>
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
        @apply relative flex items-center gap-2;
        @apply rounded-xl px-2 py-0.5;
        @apply max-h-10;
        @apply bg-neutral-200/80 dark:bg-neutral-800/80;
    }

    .power-button {
        @apply flex items-center justify-center rounded-full;
        @apply size-13;
        @apply shadow-inner transition-all duration-150;
        @apply bg-neutral-100 dark:bg-neutral-800;
        @apply hover:scale-101 active:scale-99;
    }

    .options-button {
        @apply flex size-8 items-center justify-center rounded-full;
        @apply border border-transparent;
        @apply bg-neutral-200/80 text-neutral-700 shadow-sm transition;
        @apply dark:bg-neutral-800/70 dark:text-neutral-200;
        &:hover {
            @apply bg-neutral-200;
            @apply dark:bg-neutral-800;
        }
        &:disabled {
            @apply cursor-not-allowed opacity-60;
        }
    }

    .popover-content {
        @apply relative left-0 top-full z-10;
        @apply flex min-w-fit flex-col gap-3 rounded-xl;
        @apply bg-neutral-800 border border-neutral-700;
        @apply p-5 text-sm text-neutral-50;
        @apply shadow-xl ring-1 ring-neutral-800;
    }

    .popover-header {
        @apply flex items-center justify-between gap-3 text-base font-semibold;
    }
</style>
