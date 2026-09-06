<script lang="ts">
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { Minus, Square, Copy, X } from "@lucide/svelte";
    import { onMount } from "svelte";

    // Caption buttons for the frameless window. Only rendered inside Tauri.
    // Windows gets the flat full-height caption look; everything else gets round buttons like GTK apps.
    const win = getCurrentWindow();
    const style = navigator.userAgent.includes("Windows") ? "windows" : "gtk";
    let maximized = $state(false);

    onMount(() => {
        const linux = navigator.userAgent.includes("Linux");
        const sync = async () => {
            maximized = await win.isMaximized();
            if (linux) {
                const fullscreen = await win.isFullscreen();
                document.documentElement.toggleAttribute("data-rounded-window", !maximized && !fullscreen);
            }
        };
        void sync();
        const unlisten = win.onResized(sync);
        return () => {
            document.documentElement.removeAttribute("data-rounded-window");
            void unlisten.then((fn) => fn());
        };
    });
</script>

<div class="window-controls" data-style={style}>
    <button class="caption-btn minimize" onclick={() => win.minimize()} title="Minimize" aria-label="Minimize">
        <Minus />
    </button>
    <button class="caption-btn" onclick={() => win.toggleMaximize()} title={maximized ? "Restore" : "Maximize"} aria-label={maximized ? "Restore" : "Maximize"}>
        {#if maximized}
            <Copy class="size-3!" />
        {:else}
            <Square class="size-3!" />
        {/if}
    </button>
    <button class="caption-btn close" onclick={() => win.close()} title="Close" aria-label="Close">
        <X />
    </button>
</div>

<style lang="postcss">
    @reference "global.css";

    .window-controls {
        @apply frow-0 items-center self-stretch;
    }
    .caption-btn {
        @apply inline-flex items-center justify-center text-ink-1 transition-colors;
        & > :global(svg) { @apply size-4; }
        &:focus-visible {
            @apply outline-none ring-2 ring-inset ring-accent;
        }
    }

    [data-style="windows"] {
        @apply -my-2 -mr-2.5 ml-1;
        & .caption-btn {
            @apply w-11 h-full;
            &:hover {
                @apply text-ink-0;
                background-color: var(--color-bar-control);
            }
            &.close:hover {
                @apply text-white bg-lvl-err;
            }
        }
    }

    [data-style="gtk"] {
        @apply gap-2 ml-2;
        & .caption-btn {
            @apply size-6 rounded-full;
            background-color: color-mix(in oklab, var(--color-ink-0) 12%, transparent);
            & > :global(svg) { @apply size-3.5; }
            &.minimize > :global(svg) { transform: translateY(3px); }
            &:hover {
                @apply text-ink-0;
                background-color: color-mix(in oklab, var(--color-ink-0) 22%, transparent);
            }
            &:active {
                background-color: color-mix(in oklab, var(--color-ink-0) 30%, transparent);
            }
        }
    }
</style>
