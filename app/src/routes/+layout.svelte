<script lang="ts">
    import { Registry } from '$lib/api/registry.svelte';
    import { getContext, setContext } from 'svelte';
    import './global.css';

    let { children } = $props();
    let registry: Registry = getContext("registry") ?? setContext("registry", new Registry());
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