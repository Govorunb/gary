<script lang="ts">
    import { REGISTRY, Registry } from '$lib/api/registry.svelte';
    import '../global.css';
    import { ServerManager, SERVER_MANAGER } from '$lib/app/server.svelte';
    import { Session, SESSION } from '$lib/app/session.svelte';
    import { init } from '$lib/app/utils/di';
    import { onDestroy } from 'svelte';

    let { children } = $props();
    
    // TODO: HMR reinits context
    const session = init(SESSION, () => new Session("default"));
    const registry = init(REGISTRY, () => new Registry(session));
    const serverManager = init(SERVER_MANAGER, () => new ServerManager(session, registry));

    onDestroy(() => {
        session.dispose();
    })
</script>

<div class="flex min-h-screen flex-col" role="application">
    {@render children()}
</div>