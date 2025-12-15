<script lang="ts">
    import { ExternalLink } from "@lucide/svelte";
    import type { Snippet } from "svelte";

    type Props = {
        href: string;
        icon?: boolean;
        iconSize?: number;
        children: Snippet;
    }
    const {
        href,
        icon = true,
        iconSize = 14,
        children
    }: Props = $props();
</script>

<a {href} target="_blank">
    <span class="link">{@render children()}
        {#if icon}
            <ExternalLink style="display:inline-block;" size={iconSize} />
        {/if}
    </span>
</a>

<style lang="postcss">
    @reference "global.css";
    
    .link {
        @apply text-primary-400 hover:underline text-nowrap;
    }
</style>