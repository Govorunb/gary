<script lang="ts">
    import { outclick, preventDefault } from "$lib/app/utils.svelte";
    import { SERVER_MANAGER, type ServerManager } from "$lib/app/server.svelte";
    import { injectAssert } from "$lib/app/utils/di";
    import ServerConfig from "./ServerConfig.svelte";

    let manager = injectAssert<ServerManager>(SERVER_MANAGER);

    let showOptions = $state(false);

    let running = $derived(manager.running);
    let configDisabled = $derived(running);
    let pwrBtnSize = "40px";

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

<div class="power-button-container">
    <button
        class={`power-button ${running ? "running" : "stopped"}`}
        style:height={pwrBtnSize}
        onclick={togglePower}
        oncontextmenu={handleContextMenu}
        aria-label={powerBtnTooltip}
        title={powerBtnTooltip}
    >
        <img src="power-button-power-on-svgrepo-com.svg" alt="Power button" width={pwrBtnSize} height={pwrBtnSize}>
    </button>
    <button id="options-button" class="options-button" disabled={configDisabled} onclick={toggleOptions} title={optionsBtnTooltip} aria-label={optionsBtnTooltip}>
        <img src="cogwheel-configuration-gear-svgrepo-com.svg" alt="Server options" width="24" height="24">
    </button>
    {#if showOptions && !configDisabled}
        <div class="options-popover" {@attach outclick(toggleOptions, [document.getElementById("options-button")!])}>
            <div class="options-header">
                <span>Server options</span>
                <button onclick={toggleOptions}>✕</button>
            </div>
            <ServerConfig />
        </div>
    {/if}
</div>

<style>
    .power-button-container {
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .power-button {
        padding: 0;
        margin: 0;
        border: none;
        border-radius: 100%;
        cursor: pointer;
        background-color: var(--bg) !important;
        transition: background-color 0.1s ease, opacity 0.15s ease, transform 0.15s ease;
        
        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    
        &.running {
            --bg: #0f9d58;
            box-shadow: inset 0 0 12px hsl(from var(--bg) h s calc(l * 0.5) / 50%);
        }
    
        &.stopped {
            --bg: #d93025;
            box-shadow: inset 0 0 12px hsl(from var(--bg) h s calc(l * 0.5) / 50%);
        }
    
        &:not(:disabled):active {
            transform: translateY(1px);
            opacity: 0.9;
            box-shadow: none;
        }
    }


    .options-button {
        width: 2rem;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: none;
        background: var(--surface-2, rgba(0, 0, 0, 0.1));
        cursor: pointer;
        &:disabled {
            cursor: not-allowed;
            opacity: 0.6;
        }
    }
    
    button img {
        pointer-events: none;
    }

    .options-popover {
        position: absolute;
        top: 110%;
        left: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1rem 1.75rem;
        border-radius: 0.5rem;
        background: var(--surface-1, rgba(0, 0, 0, 0.85));
        color: white;
        min-width: 250px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 10;
    }


    .options-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        & button {
            border: none;
            background: transparent;
            color: inherit;
            cursor: pointer;
        }
    }

</style>
