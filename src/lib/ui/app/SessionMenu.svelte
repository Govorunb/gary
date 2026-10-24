<script lang="ts">
    import { FolderOpen } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { getSessions } from "#lib/app/utils/di.js";
    import Popover from "#lib/ui/common/Popover.svelte";

    const sessions = getSessions();
    let open = $state(false);
    let fileInput: HTMLInputElement;

    function save() {
        open = false;
        const { name, text } = sessions.save();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        link.download = name;
        link.click();
        URL.revokeObjectURL(link.href);
        // the desktop app saves without showing a download
        toast.success("Session saved", { description: `${name} is in your downloads folder.` });
    }

    async function load() {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (!file) return;
        sessions.open(await file.text(), file.name.replace(/\.json$/i, ""))
            .mapErr(error => toast.error("Couldn't open that session", { description: error }));
    }
</script>

<Popover open={open} onOpenChange={d => open = d.open}>
    {#snippet trigger(props)}
        <button {...props} class="icon-btn bar-btn" title="Sessions">
            <FolderOpen class="size-[18px]!" />
        </button>
    {/snippet}
    <button class="menu-item" onclick={save}>
        Save session
    </button>
    <button class="menu-item" onclick={() => { open = false; fileInput.click(); }}>Open session…</button>
    {#if !sessions.viewed.live}
        <button class="menu-item" onclick={() => { open = false; sessions.showLive(); }}>Back to live session</button>
    {/if}
</Popover>
<input type="file" accept=".json,application/json" hidden bind:this={fileInput} onchange={load} />

<style lang="postcss">
    @reference "global.css";

    .bar-btn {
        @apply size-8;
        &:hover:not(:disabled) {
            background-color: var(--color-bar-control);
        }
    }
</style>
