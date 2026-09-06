<script lang="ts">
    import { getSession } from "$lib/app/utils/di";
    import OutLink from "$lib/ui/common/OutLink.svelte";
    import TeachingTooltip from "$lib/ui/common/TeachingTooltip.svelte";
    import ContextMessage from "$lib/ui/app/context/ContextMessage.svelte";
    import ContextLogMenu from "$lib/ui/app/context/ContextLogMenu.svelte";
    import ContextInput from "./ContextInput.svelte";
    import Hotkey from "$lib/ui/common/Hotkey.svelte";
    import VirtualLog from "$lib/ui/common/VirtualLog.svelte";
    import Popover from "$lib/ui/common/Popover.svelte";
    import { Search, Filter, X } from "@lucide/svelte";
    import { tick } from "svelte";
    import { SvelteSet } from "svelte/reactivity";
    import { formatContextEvent } from "./formatters/registry";
    import type { ContextRow, ContextSource } from "./formatters/types";

    const session = getSession();

    // Search and filter narrow what is shown; they never touch what the model sees.
    let searchOpen = $state(false);
    let query = $state("");
    let searchInput = $state<HTMLInputElement>();
    const SOURCES: { type: ContextSource["type"]; label: string }[] = [
        { type: "client", label: "Games" },
        { type: "actor", label: "Model" },
        { type: "user", label: "You" },
        { type: "system", label: "System" },
    ];
    const hidden = new SvelteSet<ContextSource["type"]>();
    let showSilent = $state(true);
    const filtering = $derived(hidden.size > 0 || !showSilent);

    async function openSearch() {
        searchOpen = true;
        await tick();
        searchInput?.focus();
    }
    function closeSearch() {
        searchOpen = false;
        query = "";
    }
    function toggleSource(type: ContextSource["type"]) {
        if (!hidden.delete(type)) hidden.add(type);
    }
    function sourceName(source: ContextSource): string {
        switch (source.type) {
            case "client": return source.name;
            case "actor": return session.engines[source.engineId]?.name ?? source.engineId;
            case "user": return "You";
            default: return "";
        }
    }
    function matches(row: ContextRow): boolean {
        if (hidden.has(row.source.type)) return false;
        if (!showSilent && row.rendered?.silent === true) return false;
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (row.rendered?.text ?? "").toLowerCase().includes(q) || sourceName(row.source).toLowerCase().includes(q);
    }

    function sameSource(a: ContextSource, b: ContextSource): boolean {
        if (a.type !== b.type) return false;
        switch (a.type) {
            case "client": return a.id === (b as typeof a).id;
            case "actor": return a.engineId === (b as typeof a).engineId;
            default: return true;
        }
    }

    const rows = $derived.by(() => {
        const out: ContextRow[] = [];
        let prev: ContextSource | null = null;
        for (const event of session.context.userView) {
            const rendered = formatContextEvent(event, "user");
            const source: ContextSource = rendered?.source ?? { type: "system" };
            const row = { event, rendered, source, continues: false };
            if (!matches(row)) continue;
            row.continues = prev !== null && sameSource(prev, source);
            out.push(row);
            prev = source;
        }
        return out;
    });
</script>

<div class="context-log-container">
    <div class="column-header">
        {#if searchOpen}
            <Search class="size-4 shrink-0 text-ink-3" />
            <input
                class="search-input"
                bind:this={searchInput}
                bind:value={query}
                placeholder="Search context"
                onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); closeSearch(); } }}
            />
            <button class="icon-btn" onclick={closeSearch} title="Close search" aria-label="Close search">
                <X />
            </button>
        {:else}
            <span>Context</span>
            <span class="spacer"></span>
            <button class="icon-btn" onclick={openSearch} title="Search" aria-label="Search context">
                <Search />
            </button>
        {/if}
        <Popover>
            {#snippet trigger(props)}
                <button {...props} class="icon-btn" data-active={filtering ? "" : undefined} title="Filter" aria-label="Filter context">
                    <Filter />
                </button>
            {/snippet}
            <div class="filter-panel">
                <p class="filter-heading">Show</p>
                {#each SOURCES as { type, label } (type)}
                    <label>
                        <input type="checkbox" checked={!hidden.has(type)} onchange={() => toggleSource(type)} />
                        <span>{label}</span>
                    </label>
                {/each}
                <label>
                    <input type="checkbox" bind:checked={showSilent} />
                    <span>Silent messages</span>
                </label>
            </div>
        </Popover>
        <TeachingTooltip>
            <p>Faded messages are
                <OutLink href="https://github.com/VedalAI/neuro-sdk/blob/main/API/SPECIFICATION.md#parameters-2">
                    silent
                </OutLink>
                .
            </p>
            <p>Click client names to jump to their game tab.</p>
            <p><Hotkey>Alt+C</Hotkey> to add to context.</p>
        </TeachingTooltip>
        <ContextLogMenu />
    </div>
    <div class="log">
        <VirtualLog
            class="h-full"
            items={rows}
            getKey={(row) => row.event.id}
            estimateSize={56}
            overscan={10}
            gap={0}
        >
            {#snippet children(row)}
                <ContextMessage {row} />
            {/snippet}
        </VirtualLog>
    </div>
    <ContextInput />
</div>

<style lang="postcss">
    @reference "global.css";

    .context-log-container {
        @apply fcol-0 h-full min-h-0 text-sm;
    }
    .column-header {
        @apply pr-2;
        & .icon-btn[data-active] { @apply text-accent; }
    }
    .search-input {
        @apply flex-1 min-w-0 h-7 px-2 rounded-md;
        @apply text-sm font-normal text-ink-0 bg-layer-2 placeholder:text-ink-3;
        @apply outline-none ring-1 ring-inset ring-edge focus:ring-accent;
    }
    .filter-panel {
        @apply fcol-1 w-48 p-1;
    }
    .filter-heading {
        @apply px-2 text-xs font-semibold text-ink-2;
    }
    .filter-panel label {
        @apply frow-2 cursor-pointer items-center rounded-md px-2 py-1.5 text-sm;
        @apply text-ink-1 transition-colors;
        &:hover { @apply bg-layer-4; }
        &:has(input:focus-visible) { @apply ring-2 ring-accent; }
        & input { @apply size-3.5 accent-accent; }
    }
    .log {
        @apply fcol-0 flex-1 min-h-0;
    }
</style>
