<script lang="ts">
    import GaryDashboard from "#lib/ui/app/GaryDashboard.svelte";
    import PowerButton from "#lib/ui/app/PowerButton.svelte";
    import EngineControls from "#lib/ui/app/engines/EngineControls.svelte";
    import DialogHost from "#lib/ui/app/DialogHost.svelte";
    import StoppedNotice from "#lib/ui/app/StoppedNotice.svelte";
    import WindowControls from "#lib/ui/app/WindowControls.svelte";
    import ResizeHandles from "#lib/ui/app/ResizeHandles.svelte";
    import SessionMenu from "#lib/ui/app/SessionMenu.svelte";
    import SessionScope from "#lib/ui/app/SessionScope.svelte";
    import RecordBar from "#lib/ui/app/RecordBar.svelte";
    import { Settings } from "@lucide/svelte";
    import { getSessions, getUIState, getUpdater } from "#lib/app/utils/di.js";
    import { invoke, isTauri } from "@tauri-apps/api/core";

    // The top bar doubles as the window's title bar in Tauri: drag to move, double-click to maximize,
    // right-click for the platform's window menu.
    const framed = isTauri();
    function windowMenu(evt: MouseEvent) {
        if (!framed || (evt.target as HTMLElement).closest("button, input, textarea, a")) return;
        evt.preventDefault();
        void invoke("show_window_menu");
    }

    const uiState = getUIState();
    const dialogs = uiState.dialogs;
    const updater = getUpdater();
    const sessions = getSessions();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions : right-click only opens the platform window menu -->
<header data-tauri-drag-region="deep" oncontextmenu={windowMenu}>
    <div class="justify-self-start min-w-0">
        <PowerButton />
    </div>
    <div class="justify-self-center">
        <EngineControls />
    </div>
    <div class="justify-self-end frow-2 items-center">
        {#if updater.hasPendingUpdate}
            <button class="update-btn" onclick={() => updater.promptForUpdate()}>
                Update to {updater.update?.version ?? "latest version"}
            </button>
        {/if}
        <SessionMenu />
        <button
            class="icon-btn bar-btn"
            onclick={() => dialogs.openSettingsDialog()}
            title="Settings"
        >
            <Settings class="size-[18px]!" />
        </button>
        {#if framed}
            <WindowControls />
        {/if}
    </div>
    <StoppedNotice />
</header>
<!-- the dashboard and its dialogs show the viewed session; the bar above always drives the live one -->
{#key sessions.viewed}
    <SessionScope session={sessions.viewed}>
        {#if !sessions.viewed.live}
            <RecordBar />
        {/if}
        <main>
            <GaryDashboard />
        </main>
        <DialogHost />
    </SessionScope>
{/key}
{#if framed}
    <ResizeHandles />
{/if}

<style lang="postcss">
    @reference "global.css";

    header {
        @apply relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 h-12 px-2.5 shrink-0;
        @apply bg-bar text-ink-0 select-none;
    }
    .bar-btn {
        @apply size-8;
        &:hover:not(:disabled) {
            background-color: var(--color-bar-control);
        }
    }
    .update-btn {
        @apply h-8 px-3 rounded-md text-sm font-medium text-accent transition-colors;
        background-color: var(--color-bar-control);
        &:hover { background-color: var(--color-bar-control-hover); }
    }
    main {
        @apply flex flex-1 overflow-hidden bg-layer-0;
    }
</style>
