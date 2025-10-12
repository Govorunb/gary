<script lang="ts">
    import { Registry } from '$lib/api/registry.svelte';
    import { getContext, onDestroy, setContext } from 'svelte';
    import './global.css';
    import { ServerManager, SERVER_MANAGER_CONTEXT_KEY, SERVER_MANAGER_STORE_KEY, createServerManagerStore, type ServerManagerStore } from '$lib/app/server.svelte';

    let { children } = $props();
    let registry: Registry = getContext("registry") ?? setContext("registry", new Registry());

    let serverManager = getContext<ServerManager>(SERVER_MANAGER_CONTEXT_KEY);
    let managerOwned = false;
    if (!serverManager) {
        serverManager = new ServerManager(registry);
        managerOwned = true;
        setContext(SERVER_MANAGER_CONTEXT_KEY, serverManager);
    }

    let serverManagerStore = getContext<ServerManagerStore>(SERVER_MANAGER_STORE_KEY);
    if (!serverManagerStore) {
        serverManagerStore = createServerManagerStore(serverManager);
        setContext(SERVER_MANAGER_STORE_KEY, serverManagerStore);
    }

    onDestroy(() => {
        if (managerOwned) {
            serverManager.destroy();
        }
    });
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