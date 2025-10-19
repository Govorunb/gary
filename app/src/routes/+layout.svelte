<script lang="ts">
    import { REGISTRY } from '$lib/api/registry.svelte';
    import '../global.css';
    import { ServerManager, SERVER_MANAGER } from '$lib/app/server.svelte';
    import { Session, SESSION } from '$lib/app/session.svelte';
    import { init, provide } from '$lib/app/utils/di';
    import { onDestroy } from 'svelte';
    import { USER_PREFS, UserPrefs } from '$lib/app/prefs.svelte';
    import type { LayoutProps } from './$types.js';
    import { Toaster } from "svelte-sonner";
    import { Randy } from '$lib/app/engines/randy';
    import { SCHEDULER } from '$lib/app/scheduler.svelte';

    let { data, children }: LayoutProps = $props();
    
    const userPrefs = init(USER_PREFS, () => new UserPrefs(data.userPrefsData));

    const randy = new Randy({ chanceDoNothing: 0.2 });
    const session = init(SESSION, () => new Session("default"));
    const registry = init(REGISTRY, () => session.registry);
    const scheduler = init(SCHEDULER, () => session.scheduler);
    session.activeEngine = randy; // TODO

    const serverManager = init(SERVER_MANAGER, () => new ServerManager(session, userPrefs));

    onDestroy(() => {
        session.dispose();
    })
</script>

<div class="flex min-h-screen flex-col" role="application">
    {@render children()}
</div>

<Toaster closeButton richColors position="bottom-right" theme={userPrefs.theme} duration={10000} />
