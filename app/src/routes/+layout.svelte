<script lang="ts">
    import '../global.css';
    import { onDestroy } from 'svelte';
    import type { LayoutProps } from './$types.js';
    import { Toaster } from "svelte-sonner";
    import { Randy } from '$lib/app/engines/randy';
    import { getSession, getUserPrefs, initDI } from '$lib/app/utils/di';

    let { data, children }: LayoutProps = $props();
    
    initDI(data.userPrefsData);
    const session = getSession();
    const userPrefs = getUserPrefs();
    const randy = new Randy({ chanceDoNothing: 0.2 });
    session.activeEngine = randy; // TODO
    onDestroy(() => {
        session.dispose();
    })
</script>

<div class="flex min-h-screen flex-col" role="application">
    {@render children()}
</div>

<Toaster closeButton richColors position="bottom-right" theme={userPrefs.theme} duration={10000} />
