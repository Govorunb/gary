<script lang="ts">
    import { getRegistry } from "$lib/app/utils/di";
    import Popover from "$lib/ui/common/Popover.svelte";
    import type { Snippet } from "svelte";
    import type { SvelteHTMLElements } from "svelte/elements";
    import { startDiagnosticsExample, startSchemaTest } from "./internal-connections";

    type SnippetOfHTML<T extends keyof SvelteHTMLElements> = Snippet<[SvelteHTMLElements[T]]>;

    type Props = {
        trigger: SnippetOfHTML<"button">,
    };

    let { trigger }: Props = $props();

    const registry = getRegistry();

    const schemaTest = () => startSchemaTest(registry);
    const diagnosticsExample = () => startDiagnosticsExample(registry);
</script>

<Popover {trigger}>
    <div class="connect-client-menu">
        <h3 class="menu-heading">Connect Client</h3>
        <div class="menu-divider"></div>
        <button class="menu-item" onclick={schemaTest}>
            Schema Test
        </button>
        <button class="menu-item" onclick={diagnosticsExample}>
            Diagnostics Example
        </button>
    </div>
</Popover>

<style lang="postcss">
    @reference "global.css";

    .connect-client-menu {
        @apply fcol-0.5;
    }

    .menu-heading {
        @apply pl-2;
    }

    .menu-divider {
        @apply mx-2 h-px;
        @apply bg-neutral-200 dark:bg-neutral-700;
    }

    .menu-item {
        @apply frow-1.5 items-center;
        @apply w-full px-3 py-2;
        @apply rounded-sm text-sm;
        @apply text-neutral-700 dark:text-neutral-300;
        @apply transition-colors duration-150;

        &:hover {
            @apply bg-neutral-200/70 dark:bg-neutral-700/70;
        }

        &:focus-visible {
            @apply outline-none ring-1 ring-neutral-400 dark:ring-neutral-600;
        }
    }
</style>
