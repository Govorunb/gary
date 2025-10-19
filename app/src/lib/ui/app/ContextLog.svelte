<script lang="ts">
    import { getSession } from "$lib/app/utils/di";
    import type { Source } from "$lib/app/context.svelte";

    let session = getSession();

    const messageBaseClasses = "flex gap-2 items-center rounded-lg border px-3 py-2 transition hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60";
    const sourceAccent: Record<Source['type'], string> = {
        system: "border-amber-400/40",
        client: "border-sky-400/40",
        user: "border-emerald-400/40",
        actor: "border-purple-400/40",
    };

    function getSourceIcon(source: Source): string {
        switch (source.type) {
            case "system":
                return "⚙️";
            case "client":
                return "🎮";
            case "user":
                return "👤";
            case "actor":
                // TODO: mark manual 'actor' acts (tony)
                return "🤖";
            default:
                return "";
        }
    }
</script>

<div class="flex flex-col gap-2">
    <h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-50">Context Log</h2>
    <!-- TODO: scrolling log component ($effect() to scroll to bottom unless manually scrolled up, etc.) -->
    <div class="flex flex-col-reverse"> <!-- instead of reversing the array -->
        <div class="flex h-full max-h-[calc(100vh-12rem)] flex-col gap-2 overflow-scroll rounded-xl bg-white/80 p-4 text-sm shadow-sm ring-1 ring-neutral-200/60 backdrop-blur-sm dark:bg-neutral-900/70 dark:ring-neutral-800">
            <!-- TODO: this should render as a grid (currently long messages will break the timestamp into two lines, misaligning everything) -->
            {#each session.context.userView as msg (msg.id)}
                <div class={`${messageBaseClasses} ${sourceAccent[msg.source.type]}`}>
                    <!-- TODO: put icon in corner (real estate) -->
                    <!-- TODO: more icons (silent, ephemeral, etc) in one or more corners -->
                    <span class="text-lg">{getSourceIcon(msg.source)}</span>
                    <span class="text-xs text-neutral-500 dark:text-neutral-400">{msg.timestamp.toLocaleTimeString()}</span>
                    <!-- TODO: click to focus that game's tab -->
                    {#if msg.source.type === 'client'}
                        <span class="font-semibold text-neutral-700 dark:text-neutral-200">{msg.source.name}:</span>
                    {/if}
                    <span class="whitespace-pre-wrap text-neutral-700 dark:text-neutral-100">{msg.text}</span>
                </div>
            {/each}
        </div>
    </div>
</div>
