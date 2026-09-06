<script lang="ts">
    import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
    import { onMount } from "svelte";

    // Invisible strips along the window edges. The undecorated window has no native resize border on
    // Wayland, so these hand the drag to the compositor.
    type ResizeDirection = Parameters<Window["startResizeDragging"]>[0];
    const win = getCurrentWindow();
    let maximized = $state(false);

    onMount(() => {
        const sync = () => win.isMaximized().then((m) => maximized = m);
        void sync();
        const unlisten = win.onResized(sync);
        return () => void unlisten.then((fn) => fn());
    });

    const EDGES: ResizeDirection[] = ["North", "South", "East", "West", "NorthWest", "NorthEast", "SouthWest", "SouthEast"];

    function start(direction: ResizeDirection, evt: MouseEvent) {
        if (evt.button !== 0) return;
        evt.preventDefault();
        void win.startResizeDragging(direction);
    }
</script>

{#if !maximized}
    {#each EDGES as direction (direction)}
        <div class="resize-handle" data-edge={direction} onmousedown={(e) => start(direction, e)} role="presentation"></div>
    {/each}
{/if}

<style lang="postcss">
    @reference "global.css";

    .resize-handle {
        --b: 5px;
        @apply fixed z-[100];
        &[data-edge="North"] { top: 0; left: var(--b); right: var(--b); height: var(--b); cursor: n-resize; }
        &[data-edge="South"] { bottom: 0; left: var(--b); right: var(--b); height: var(--b); cursor: s-resize; }
        &[data-edge="West"] { left: 0; top: var(--b); bottom: var(--b); width: var(--b); cursor: w-resize; }
        &[data-edge="East"] { right: 0; top: var(--b); bottom: var(--b); width: var(--b); cursor: e-resize; }
        &[data-edge="NorthWest"] { top: 0; left: 0; width: calc(var(--b) * 2); height: calc(var(--b) * 2); cursor: nw-resize; }
        &[data-edge="NorthEast"] { top: 0; right: 0; width: calc(var(--b) * 2); height: calc(var(--b) * 2); cursor: ne-resize; }
        &[data-edge="SouthWest"] { bottom: 0; left: 0; width: calc(var(--b) * 2); height: calc(var(--b) * 2); cursor: sw-resize; }
        &[data-edge="SouthEast"] { bottom: 0; right: 0; width: calc(var(--b) * 2); height: calc(var(--b) * 2); cursor: se-resize; }
    }
</style>
