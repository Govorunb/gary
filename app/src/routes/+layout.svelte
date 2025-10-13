<script lang="ts">
    import { REGISTRY, Registry } from '$lib/api/registry.svelte';
    import './global.css';
    import { ServerManager, SERVER_MANAGER } from '$lib/app/server.svelte';
    import { init } from '$lib/app/utils/di';

    let { children } = $props();
    const registry = init(REGISTRY, () => new Registry());
    const serverManager = init(SERVER_MANAGER, () => new ServerManager(registry));
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