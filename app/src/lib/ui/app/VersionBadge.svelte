<script lang="ts">
    type Props = {
        version: string;
    };
    let { version }: Props = $props();
</script>

<div class={["version-badge", version]}>
    <span>{version}</span>
</div>

<style lang="postcss">
    @reference "global.css";

    .version-badge {
        @apply inline-flex items-center
        rounded-lg px-2 py-0.5
        text-sm font-semibold uppercase tracking-wide shadow-sm;
    }

    .v1 {
        @apply bg-sky-500/90 text-white;
    }

    .v2 {
        @apply bg-amber-500/90 text-neutral-900;
    }
</style>
