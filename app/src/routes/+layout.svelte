<script lang="ts">
    import '../global.css';
    import { onDestroy } from 'svelte';
    import type { LayoutProps } from './$types.js';
    import { Toaster } from "svelte-sonner";
    import { getSession, getUserPrefs, initDI } from '$lib/app/utils/di';
    import dayjs from 'dayjs';
    import relativeTime from "dayjs/plugin/relativeTime";
    import { registerAppHotkey } from '$lib/app/utils/hotkeys.svelte';
    
    dayjs.extend(relativeTime);
    let { data, children }: LayoutProps = $props();
    
    // svelte-ignore state_referenced_locally
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
    registerAppHotkey(['Shift', 'L', 'Backspace', 'Delete'], () => {
        localStorage.clear();
        location.reload();
    })
</script>

<div class="flex flex-col h-screen" role="application">
    {@render children()}
</div>

<Toaster closeButton richColors position="bottom-right" theme={userPrefs.app.theme} duration={10000} />
