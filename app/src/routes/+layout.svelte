<script lang="ts">
    let { children } = $props();
</script>

<div class="app-root" role="application">
    {@render children()}
</div>

<style>
    .app-root {
        display: flex;
        flex-direction: column;
        height: 100%;
    }
</style>