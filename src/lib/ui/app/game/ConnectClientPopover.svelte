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
        @apply bg-layer-4;
    }
</style>
