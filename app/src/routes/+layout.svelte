<script lang="ts">
    import '../global.css';
    import { onDestroy } from 'svelte';
    import type { LayoutProps } from './$types.js';
    import { Toaster } from "svelte-sonner";
    import { getSession, getUserPrefs, initDI } from '$lib/app/utils/di';
    import { PressedKeys } from 'runed';

    let { data, children }: LayoutProps = $props();
    
    initDI(data.userPrefsData);
    const session = getSession();
    const userPrefs = getUserPrefs();
    onDestroy(() => {
        session.dispose();
    });
    // debugging
    (window as any).SESSION = session;
    (window as any).USER_PREFS = userPrefs;
    
    // delete localstorage (dev hotkey)
    let keys = new PressedKeys();
    keys.onKeys(['Shift', 'L', 'Backspace', 'Delete'], () => {
        localStorage.clear();
        location.reload();
    })
</script>

<div class="flex flex-col h-screen" role="application">
    {@render children()}
</div>

<Toaster closeButton richColors position="bottom-right" theme={userPrefs.app.theme} duration={10000} />
