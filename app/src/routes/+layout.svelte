<script lang="ts">
    import '../global.css';
    import { onDestroy } from 'svelte';
    import type { LayoutProps } from './$types.js';
    import { Toaster } from "svelte-sonner";
    import { getSession, getUserPrefs, initDI } from '$lib/app/utils/di';

    let { data, children }: LayoutProps = $props();
    
    initDI(data.userPrefsData);
    const session = getSession();
    const userPrefs = getUserPrefs();
    onDestroy(() => {
        session.dispose();
    });
    (window as any).SESSION = session;
    (window as any).USER_PREFS = userPrefs;
</script>

<div class="flex min-h-screen flex-col" role="application">
    {@render children()}
</div>

<Toaster closeButton richColors position="bottom-right" theme={userPrefs.app.theme} duration={10000} />
