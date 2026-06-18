<script lang="ts" generics="T">
    import {
        elementScroll,
        measureElement,
        observeElementOffset,
        observeElementRect,
        Virtualizer,
        type VirtualItem,
    } from "@tanstack/virtual-core";
    import { onMount, tick, untrack, type Snippet } from "svelte";
    import type { Action } from "svelte/action";

    type Props = {
        items: readonly T[];
        getKey: (item: T, index: number) => string;
        estimateSize?: number;
        overscan?: number;
        stickToBottom?: boolean;
        bottomThreshold?: number;
        class?: string;
        children: Snippet<[item: T, index: number]>;
        empty?: Snippet<[]>;
    };

    let {
        items,
        getKey,
        estimateSize = 72,
        overscan = 8,
        stickToBottom = true,
        bottomThreshold = 96,
        class: className,
        children,
        empty,
    }: Props = $props();

    let scrollEl: HTMLDivElement | null = $state(null);
    let virtualItems: VirtualItem[] = $state([]);
    let totalSize = $state(0);
    let wasNearBottom = $state(true);
    let previousCount = 0;
    let previousFirstKey: string | null = null;
    let previousLastKey: string | null = null;
    let scrollRestoreVersion = 0;

    const virtualizer = new Virtualizer<HTMLDivElement, HTMLDivElement>({
        count: 0,
        getScrollElement: () => null,
        getItemKey: (index) => index,
        estimateSize: () => 72,
        overscan: 8,
        gap: 8,
        scrollToFn: elementScroll,
        observeElementRect,
        observeElementOffset,
        measureElement,
        onChange: updateVirtualState,
    });

    onMount(() => virtualizer._didMount());

    $effect(() => {
        const count = items.length;
        const currentScrollEl = scrollEl;
        const currentEstimateSize = estimateSize;
        const currentOverscan = overscan;
        const scrollTopBeforeUpdate = currentScrollEl?.scrollTop ?? 0;

        virtualizer.setOptions({
            count,
            getScrollElement: () => currentScrollEl,
            getItemKey: (index) => getKey(items[index]!, index),
            estimateSize: () => currentEstimateSize,
            overscan: currentOverscan,
            gap: 8,
            scrollToFn: elementScroll,
            observeElementRect,
            observeElementOffset,
            measureElement,
            onChange: updateVirtualState,
        });
        virtualizer._willUpdate();
        if (shouldResetMeasurements(count)) {
            virtualizer.measure();
        }
        updateVirtualState(virtualizer);

        if (stickToBottom && count > previousCount) {
            const shouldFollow = untrack(() => wasNearBottom);
            if (shouldFollow) {
                void tick().then(scrollToBottom);
            } else {
                restoreScrollTopAfterAppend(scrollTopBeforeUpdate);
            }
        }

        previousCount = count;
        previousFirstKey = count > 0 ? getKey(items[0]!, 0) : null;
        previousLastKey = count > 0 ? getKey(items[count - 1]!, count - 1) : null;
    });

    const measureRow: Action<HTMLDivElement> = (node) => {
        virtualizer.measureElement(node);

        return {
            update() {
                virtualizer.measureElement(node);
            },
            destroy() {
                virtualizer.measureElement(null);
            },
        };
    };

    function updateVirtualState(instance: Virtualizer<HTMLDivElement, HTMLDivElement>) {
        virtualItems = instance.getVirtualItems().filter((item) => item.index < items.length);
        totalSize = instance.getTotalSize();
    }

    function shouldResetMeasurements(count: number): boolean {
        if (previousCount === 0 || count === 0) return false;
        if (count < previousCount) return true;

        const firstKey = getKey(items[0]!, 0);
        if (firstKey !== previousFirstKey) return true;

        if (count === previousCount) {
            const lastKey = getKey(items[count - 1]!, count - 1);
            return lastKey !== previousLastKey;
        }

        const lastPreviousIndex = previousCount - 1;
        const lastPreviousKey = getKey(items[lastPreviousIndex]!, lastPreviousIndex);
        return lastPreviousKey !== previousLastKey;
    }

    function updateBottomState() {
        if (!scrollEl) return;

        const distanceFromBottom = scrollEl.scrollHeight - scrollEl.clientHeight - scrollEl.scrollTop;
        wasNearBottom = distanceFromBottom <= bottomThreshold;
    }

    function scrollToBottom() {
        if (items.length === 0) return;
        virtualizer.scrollToIndex(items.length - 1, { align: "end" });
        updateBottomState();
    }

    function restoreScrollTop(scrollTop: number) {
        if (!scrollEl) return;
        scrollEl.scrollTop = scrollTop;
        updateBottomState();
    }

    function restoreScrollTopAfterAppend(scrollTop: number) {
        const version = ++scrollRestoreVersion;
        const restoreIfCurrent = () => {
            if (version !== scrollRestoreVersion) return;
            restoreScrollTop(scrollTop);
        };

        void tick().then(() => {
            restoreIfCurrent();
            requestAnimationFrame(restoreIfCurrent);
            requestAnimationFrame(() => requestAnimationFrame(restoreIfCurrent));
            setTimeout(restoreIfCurrent, 120);
        });
    }
</script>

<div class={["virtual-log", className]} bind:this={scrollEl} onscroll={updateBottomState}>
    {#if items.length === 0}
        {#if empty}
            {@render empty()}
        {/if}
    {:else}
        <div class="virtual-log-spacer" style:height={`${totalSize}px`}>
            {#each virtualItems as virtualItem (virtualItem.key)}
                {@const item = items[virtualItem.index]}
                {#if item !== undefined}
                    <div
                        class="virtual-log-row"
                        data-index={virtualItem.index}
                        style:transform={`translateY(${virtualItem.start}px)`}
                        use:measureRow
                    >
                        {@render children(item, virtualItem.index)}
                    </div>
                {/if}
            {/each}
        </div>
    {/if}
</div>

<style lang="postcss">
    @reference "global.css";

    .virtual-log {
        @apply min-h-0 overflow-y-auto;
        overflow-anchor: none;
    }

    .virtual-log-spacer {
        @apply relative w-full;
    }

    .virtual-log-row {
        @apply absolute left-0 top-0 w-full;
    }
</style>
