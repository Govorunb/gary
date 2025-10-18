<script lang="ts">
    import { SERVER_MANAGER, type ServerManager } from "$lib/app/server.svelte";
    import { USER_PREFS, type UserPrefs } from "$lib/app/prefs.svelte";
    import { injectAssert } from "$lib/app/utils/di";
    import ServerConfig from "./ServerConfig.svelte";
    import { CirclePower, SlidersHorizontal } from "@lucide/svelte";
    import { Popover, Portal } from "@skeletonlabs/skeleton-svelte";
    import { boolAttr } from "runed";
    import * as log from "@tauri-apps/plugin-log";

    let userPrefs = injectAssert<UserPrefs>(USER_PREFS);
    let manager = injectAssert<ServerManager>(SERVER_MANAGER);

    let running = $derived(manager.running);
    let configDisabled = $derived(running);

    let powerBtnTooltip = $derived(running ? "Stop server" : "Start server");
    let optionsBtnTooltip = $derived(configDisabled ? "Server is running" : "Server options");

    async function togglePower() {
        try {
            await manager.toggle();
        } catch (e) {
            let err_title = `Failed to ${running ? "stop" : "start"} server`;
            log.error(`${err_title}: ${e}`);
            let err_msg = e as string;
            if (err_msg.includes("in use")) {
                err_msg = `The port ${userPrefs.serverPort} is already in use. Check for other instances of Gary, Tony, etc.`;
            }
            // TODO: toast
            console.error(`${err_title}:\n${err_msg}`);
        }
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
        <p class="text-sm">Server is running on port {userPrefs.serverPort}</p>
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
            dark:bg-neutral-800;
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
