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
    const haveTauri = '__TAURI_INTERNALS__' in window;
    if (!haveTauri) powerBtnTooltip = "Tauri backend not available";

    // TODO: shutting off with connected games should be a hold action (~1s) with Shift+Click bypass
    async function togglePower() {
        let res = await manager.toggle();
        if (res.isErr()) {
            let err_title = `Failed to ${running ? "stop" : "start"} server`;
            let err_msg = res.error;
            if (typeof(err_msg) !== "string") {
                err_msg = `Internal error: ${err_msg}`;
            } else if (err_msg.includes("in use")) {
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

    function getBtnStroke() {
        if (!haveTauri) return "stroke-surface-100 dark:stroke-surface-900";
        return running
            ? "stroke-green-400 dark:stroke-green-700"
            : "stroke-red-400 dark:stroke-red-700";
    }
</script>

<div class="flex flex-row items-center gap-3">
    <div class="power-button-container">
        <button
            class="power-button"
            data-running={boolAttr(running)}
            onclick={togglePower}
            aria-label={powerBtnTooltip}
            title={powerBtnTooltip}
            disabled={!haveTauri}
        >
            <!-- class is a passdown prop, not actual css -->
            <CirclePower size={40} class={["pointer-events-none", getBtnStroke()]} />
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
                            <Popover.Arrow>
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
    @reference "global.css";

    .power-button-container {
        @apply relative flex items-center gap-2;
        @apply rounded-xl px-2 py-0.5;
        @apply max-h-10;
        @apply bg-neutral-100 dark:bg-neutral-800/80;
    }

    .power-button {
        @apply flex items-center justify-center rounded-full;
        @apply size-13;
        @apply shadow-inner transition-all duration-150;
        @apply bg-neutral-100 dark:bg-neutral-800;
        @apply disabled:cursor-not-allowed;
        &:not(:disabled) {
            @apply hover:scale-101 active:scale-99;
        }
    }

    .options-button {
        @apply flex size-8 items-center justify-center rounded-full;
        @apply border border-transparent;
        @apply text-neutral-700 shadow-sm transition;
        @apply disabled:cursor-not-allowed;
        /* in light mode, distinguished by shadow; in dark - by ring */
        @variant dark {
            @apply bg-neutral-800 text-neutral-200;
            @apply ring ring-primary-400/10;
        }
        &:hover:not(:disabled) {
            @apply bg-neutral-200/80 dark:bg-neutral-800/70;
            @apply dark:ring-primary-400/40;
        }
    }

    .popover-content {
        @apply relative left-0 top-full z-10;
        @apply flex min-w-fit flex-col gap-3 rounded-xl;
        @apply p-5 text-sm;
        @apply bg-neutral-100 dark:bg-neutral-800;
        @apply text-neutral-900 dark:text-neutral-50;
        @apply shadow-xl ring-1 ring-neutral-200 dark:ring-neutral-800;
        @apply dark:border dark:border-neutral-700;
    }

    .popover-header {
        @apply flex items-center justify-between gap-3 text-base font-semibold;
    }
</style>
