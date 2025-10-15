<script lang="ts">
    import { outclick, preventDefault } from "$lib/app/utils.svelte";
    import { SERVER_MANAGER, type ServerManager } from "$lib/app/server.svelte";
    import { injectAssert } from "$lib/app/utils/di";
    import ServerConfig from "./ServerConfig.svelte";
    import { CirclePower, SlidersHorizontal } from "@lucide/svelte";

    let manager = injectAssert<ServerManager>(SERVER_MANAGER);

    let showOptions = $state(false);

    let running = $derived(manager.running);
    let configDisabled = $derived(running);
    let pwrBtnSize = 40;

    let powerBtnTooltip = $derived(running ? "Stop server" : "Start server")
    let optionsBtnTooltip = $derived(configDisabled ? "Server is running" : "Server options")

    async function togglePower() {
        await manager.toggle();
    }

    function toggleOptions() {
        if (configDisabled) return;
        showOptions = !showOptions;
    }
    
    $effect(() => {
        if (configDisabled) showOptions = false;
    })

    const handleContextMenu = preventDefault(() => {
        if (configDisabled) return;
        toggleOptions();
    });
</script>

<div class="relative flex items-center gap-2">
    <button
        class={`flex items-center justify-center rounded-full bg-neutral-900 text-white shadow-inner transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:focus-visible:ring-offset-neutral-100 ${running ? "ring-emerald-400/70 focus-visible:ring-emerald-300" : "ring-rose-500/70 focus-visible:ring-rose-300"}`}
        style:height="{pwrBtnSize}px"
        style:width="{pwrBtnSize}px"
        onclick={togglePower}
        oncontextmenu={handleContextMenu}
        aria-label={powerBtnTooltip}
        title={powerBtnTooltip}
    >
        <CirclePower size={pwrBtnSize} color={running ? "#0f9d58" : "#d93025"} style="pointer-events: none;" />
    </button>
    <button
        id="options-button"
        class="flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-neutral-200/80 text-neutral-700 shadow-sm transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-800/70 dark:text-neutral-200 dark:hover:bg-neutral-800"
        disabled={configDisabled}
        onclick={toggleOptions}
        title={optionsBtnTooltip}
        aria-label={optionsBtnTooltip}
    >
        <SlidersHorizontal size=24 style="pointer-events: none;" />
    </button>
    {#if showOptions && !configDisabled}
        <div
            class="absolute left-0 top-full z-10 mt-3 flex min-w-[250px] flex-col gap-3 rounded-xl bg-neutral-900/95 p-5 text-sm text-neutral-50 shadow-2xl ring-1 ring-neutral-800 backdrop-blur"
            {@attach outclick(toggleOptions, [document.getElementById("options-button")!])}
        >
            <div class="flex items-center justify-between gap-3 text-base font-semibold">
                <span>Server options</span>
                <button
                    class="rounded-md p-1 text-neutral-100/80 transition hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-100/60"
                    onclick={toggleOptions}
                >
                    ✕
                </button>
            </div>
            <ServerConfig />
        </div>
    {/if}
</div>
