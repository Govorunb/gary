<script lang="ts">
    import { getUserPrefs, getServerManager, getRegistry } from "$lib/app/utils/di";
    import ServerConfig from "./ServerConfig.svelte";
    import { CirclePower, SlidersHorizontal } from "@lucide/svelte";
    import Dialog from '$lib/ui/common/Dialog.svelte';
    import Popover from "$lib/ui/common/Popover.svelte";
    import { boolAttr } from "runed";
    import { isTauri } from "@tauri-apps/api/core";
    import { Copy, Check } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { tooltip } from "$lib/app/utils";
    import { EVENT_BUS } from "$lib/app/events/bus";
    import { LOCAL_SERVER_HOST } from "$lib/app/prefs.svelte";

    const userPrefs = getUserPrefs();
    const registry = getRegistry();
    const manager = getServerManager();

    let running = $derived(manager.running);

    let powerBtnTooltip = $derived(running ? "Stop server" : "Start server");
    const optionsBtnTooltip = "Server options";
    const haveTauri = isTauri();
    if (!haveTauri) powerBtnTooltip = "Tauri backend not available";

    let confirmModalOpen = $state(false);

    async function togglePower(confirm?: boolean) {
        if (running && registry.games.length > 0 && !confirm) {
            confirmModalOpen = true;
            return;
        }
        confirmModalOpen = false;
        let res = await manager.toggle();
        if (res.isErr()) {
            let err_msg = res.error;
            if (typeof(err_msg) !== "string") {
                err_msg = `Internal error: ${err_msg}`;
            } else if (err_msg.includes("in use")) {
                err_msg = `The port ${userPrefs.api.server.port} is already in use. Check for other instances of Gary, Tony, etc.`;
            }
            EVENT_BUS.emit('ui/server/toggle_failed', { wasRunning: running, error: err_msg });
        }
    }

    $effect(() => {
        if (confirmModalOpen && registry.games.length === 0) {
            confirmModalOpen = false;
            togglePower(true);
        }
    })

    const address = $derived(`ws://${LOCAL_SERVER_HOST}:${userPrefs.api.server.port}`);
    const addressTip = $derived.by(() => {
        if (!haveTauri) return "Tauri backend not available";
        const state = running
            ? (userPrefs.api.server.bindAllInterfaces ? "Listening on all interfaces" : "Server running")
            : "Server offline";
        return `${state}. Click to copy address`;
    });
    let copied = $state(false);
    function copyAddress() {
        navigator.clipboard.writeText(address);
        toast.success("Copied address to clipboard", { duration: 1500 });
        copied = true;
        setTimeout(() => copied = false, 1500);
    }
</script>

<div class="frow-2.5 items-center min-w-0">
    <div class="power-button-container">
        <button
            class="power-button"
            data-running={boolAttr(running)}
            onclick={(e) => togglePower(e.shiftKey)}
            aria-label={powerBtnTooltip}
            title={powerBtnTooltip}
            disabled={!haveTauri}
        >
            <CirclePower size={34} />
        </button>
        <Popover>
            {#snippet trigger(props)}
                <button {...props}
                    class="options-button"
                    title={optionsBtnTooltip}
                    aria-label={optionsBtnTooltip}
                    >
                    <SlidersHorizontal size={16} class="pointer-events-none" />
                </button>
            {/snippet}
            <div class="fcol-2 p-2">
                <ServerConfig />
            </div>
        </Popover>
    </div>
    <button
        class="address not-lg:hidden"
        data-running={boolAttr(running)}
        onclick={copyAddress}
        {@attach tooltip(addressTip)}
    >
        <span class="truncate">{address}</span>
        {#if copied}
            <Check size={12} />
        {:else}
            <Copy size={12} />
        {/if}
    </button>
</div>
<Dialog bind:open={confirmModalOpen}>
    {#snippet content(props)}
        <div {...props} class="confirm-content attention">
            <h3>Confirm stopping server</h3>
            <p>Are you sure you want to stop the server? There are still open connections.</p>
            <p class="note">Shift-click to bypass this confirmation.</p>
            <div class="frow-2 justify-end">
                <button class="btn btn-danger" onclick={() => togglePower(true)}>Disconnect all games</button>
                <button class="btn" onclick={() => confirmModalOpen = false}>Cancel</button>
            </div>
        </div>
    {/snippet}
</Dialog>

<style lang="postcss">
    @reference "global.css";
    .power-button-container {
        @apply relative frow-0.5 items-center;
        @apply h-9 pl-0.5 pr-1 rounded-full;
        background-color: var(--color-bar-control);
    }
    .power-button {
        @apply frow-0 items-center justify-center rounded-full size-9;
        @apply transition-all duration-150;
        @apply disabled:cursor-not-allowed;
        &:not(:disabled) {
            @apply hover:scale-102 active:scale-98;
        }
        /* Off is red on purpose: starting the server is the first thing a new user has to find. */
        @apply text-lvl-err;
        &[data-running] {
            @apply text-lvl-ok;
        }
        &:disabled {
            @apply text-ink-3 opacity-50;
        }
        & > * {
            @apply pointer-events-none;
        }
    }
    .options-button {
        @apply frow-0 size-7 items-center justify-center rounded-full;
        @apply text-ink-2 transition-colors;
        &:hover:not(:disabled) {
            @apply text-ink-0;
            background-color: color-mix(in oklab, var(--color-ink-0) 10%, transparent);
        }
    }
    .address {
        @apply frow-1.5 items-center min-w-0 h-7 px-2 rounded-md;
        @apply font-mono text-xs text-ink-2 transition-colors;
        &:not([data-running]) { @apply opacity-50; }
        &:hover {
            @apply text-ink-0;
            background-color: var(--color-bar-control);
        }
    }
    .confirm-content {
        @apply fcol-2 min-w-[24rem] max-w-[90vw] overflow-hidden;
        @apply bg-layer-1 ring-1 ring-edge;
        @apply rounded-2xl shadow-2xl;
        @apply p-5 text-sm text-ink-1;
    }
</style>
