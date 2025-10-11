<script lang="ts">
    type Props = {
        version: string;
    }
    let { version }: Props = $props();
</script>

<div class="version-badge {version}">{version}</div>

<style>
    .version-badge {
        border-radius: 8px;
        border: 1px solid transparent;
        padding: 0 0.2em 0 0.3em;
        font-size: 0.9em;
        font-weight: 500;
        font-family: inherit;
        box-shadow: 0 2px 2px rgba(0, 0, 0, 0.2);
        /* TODO: generate */
        &.v1 {
            background-color: light-dark(#396cd8, #4e77d1);
        }
        &.v2 {
            background-color: light-dark(#ff8b00, #f7a644);
        }
    }
</style>
