<script lang="ts">
    type Props = {
        version: string;
    }
    let { version }: Props = $props();
</script>

<div class="version-badge {version}">
    <span>{version}</span>
</div>

<style>
    .version-badge {
        border-radius: 8px;
        border: 1px solid transparent;
        padding: 0 0.2em;
        font-size: 90%;
        font-weight: 500;
        line-height: 20px;
        max-height: 2rem;
        min-height: 1rem;
        margin-inline-end: 6px;
        font-family: inherit;
        box-shadow: 0 2px 2px rgba(0, 0, 0, 0.2);
        --v1-color: #628deb;
        --v2-color: #ff8b00;
        &.v1 {
            background-color: light-dark(var(--v1-color), hsl(from var(--v1-color) h s calc(l / 1.5)));
        }
        &.v2 {
            background-color: light-dark(var(--v2-color), hsl(from var(--v2-color) h s calc(l / 1.5)));
        }
    }
</style>
