<script lang="ts">
    import { REGISTRY, Registry } from '$lib/api/registry.svelte';
    import '../global.css';
    import { ServerManager, SERVER_MANAGER } from '$lib/app/server.svelte';
    import { Session, SESSION } from '$lib/app/session.svelte';
    import { init } from '$lib/app/utils/di';
    import { onDestroy } from 'svelte';
    import { USER_PREFS, UserPrefs } from '$lib/app/prefs.svelte';
    import type { LayoutProps } from './$types.js';

    let { data, children }: LayoutProps = $props();
    
    // TODO: HMR reinits context
    const userPrefs = init(USER_PREFS, () => new UserPrefs(data.userPrefsData));
    const session = init(SESSION, () => new Session("default"));
    const registry = init(REGISTRY, () => new Registry(session));
    const serverManager = init(SERVER_MANAGER, () => new ServerManager(session, registry, userPrefs));

    onDestroy(() => {
        session.dispose();
    })
</script>

<div class="flex min-h-screen flex-col" role="application">
    {@render children()}
</div>
