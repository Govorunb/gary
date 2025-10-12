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

    async function togglePower() {
        if (!manager) return;
        await manager.toggle();
    }

    function toggleOptions() {
        showOptions = !showOptions;
    }

    function openOptions() {
        showOptions = true;
    }

    function closeOptions() {
        showOptions = false;
    }

    function updatePort(value: number) {
        if (!manager) return;
        manager.setPort(value);
    }

    let portDisabled = $derived(running || manager == null);

    const handleContextMenu = preventDefault(() => {
        if (disabled) return;
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
        disabled={disabled}
        {@attach throttleClick(500, togglePower)}
        oncontextmenu={handleContextMenu}
    >
        {running ? "Running" : "Stopped"}
    </button>
    <button class="options-button" disabled={disabled} onclick={toggleOptions}>
        ⚙️
    </button>
    {#if showOptions}
        <div class="options-popover">
            <div class="options-header">
                <span>Server options</span>
                <button onclick={closeOptions}>✕</button>
            </div>
            <label for="power-port">Port</label>
            <input
                id="power-port"
                type="number"
                min="1024"
                max="65535"
                value={localPort}
                disabled={portDisabled}
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
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 999px;
        color: white;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.1s ease, box-shadow 0.1s ease;
    }

    .power-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .power-button.running {
        background-color: #0f9d58;
        box-shadow: 0 0 12px rgba(15, 157, 88, 0.5);
    }

    .power-button.stopped {
        background-color: #d93025;
        box-shadow: 0 0 12px rgba(217, 48, 37, 0.4);
    }

    .power-button:not(:disabled):active {
        transform: translateY(1px);
        box-shadow: none;
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
    }

    .options-button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }

    .options-popover {
        position: absolute;
        top: 110%;
        left: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.75rem;
        border-radius: 0.5rem;
        background: var(--surface-1, rgba(0, 0, 0, 0.85));
        color: white;
        min-width: 200px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 10;
    }

    .options-popover input {
        width: 100%;
    }

    .options-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
    }

    .options-header button {
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
    }
</style>
