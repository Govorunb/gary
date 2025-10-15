<script lang="ts">
    type Props = {
        version: string;
    }
    let { version }: Props = $props();
</script>

<div class={`inline-flex items-center rounded-lg border border-transparent px-2 py-0.5 text-xs font-semibold uppercase tracking-wide shadow-sm ${version === "v1" ? "bg-sky-500/90 text-white" : version === "v2" ? "bg-amber-500/90 text-neutral-900" : "bg-neutral-200/80 text-neutral-700"}`}>
    <span>{version}</span>
</div>
