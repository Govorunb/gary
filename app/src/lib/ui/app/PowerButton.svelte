<script lang="ts">
    import { getContext, onDestroy, onMount } from "svelte";
    import { preventDefault, throttleClick } from "$lib/app/utils.svelte";
    import { SERVER_MANAGER_STORE_KEY } from "$lib/app/server.svelte";
    import type { ServerManagerStore, ServerManager } from "$lib/app/server.svelte";

    let managerStore = getContext<ServerManagerStore>(SERVER_MANAGER_STORE_KEY);
    let manager = $state<ServerManager | null>(null);
    let unsubscribe: (() => void) | undefined = $state();

    let showOptions = $state(false);
    let localPort = $state(8000);

    onMount(() => {
        if (!managerStore) return;
        unsubscribe = managerStore.subscribe(value => manager = value);
    });

    onDestroy(() => {
        unsubscribe?.();
    });

    $effect(() => {
        if (manager) {
            localPort = manager.port;
        }
    });

    let running = $derived(manager?.running ?? false);
    let disabled = $derived(manager == null);
    let configDisabled = $derived(running || disabled);
    let pwrBtnSize = "40px";

    let powerBtnTooltip = $derived(disabled ? "Internal error: server manager not found" : running ? "Stop server" : "Start server")
    let optionsBtnTooltip = $derived(disabled ? "Internal error: server manager not found" : configDisabled ? "Server is running" : "Server options")

    async function togglePower() {
        if (!manager) return;
        await manager.toggle();
    }

    function toggleOptions() {
        if (configDisabled) return;
        showOptions = !showOptions;
    }

    function updatePort(value: number) {
        manager?.setPort(value);
    }

    
    $effect(() => {
        if (configDisabled) showOptions = false;
    })

    const handleContextMenu = preventDefault(() => {
        if (disabled || configDisabled) return;
        toggleOptions();
    });

    function onPortChange(evt: Event) {
        const target = evt.target as HTMLInputElement;
        updatePort(target.valueAsNumber);
    }
</script>

<div class="power-button-container">
    <button
        class={`power-button ${running ? "running" : "stopped"}`}
        style:height={pwrBtnSize}
        {disabled}
        {@attach throttleClick(500, togglePower)}
        oncontextmenu={handleContextMenu}
        aria-label={powerBtnTooltip}
        title={powerBtnTooltip}
    >
        <img src="power-button-power-on-svgrepo-com.svg" alt="Power button" width={pwrBtnSize} height={pwrBtnSize}>
    </button>
    <button class="options-button" disabled={disabled || configDisabled} onclick={toggleOptions} title={optionsBtnTooltip} aria-label={optionsBtnTooltip}>
        <img src="cogwheel-configuration-gear-svgrepo-com.svg" alt="Server options" width="24" height="24">
    </button>
    {#if showOptions && !configDisabled}
        <div class="options-popover">
            <div class="options-header">
                <span>Server options</span>
                <button onclick={toggleOptions}>✕</button>
            </div>
            <label for="power-port">Port</label>
            <input
                id="power-port"
                type="number"
                min="1024"
                max="65535"
                value={localPort}
                disabled={configDisabled}
                oninput={onPortChange}
            />
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
