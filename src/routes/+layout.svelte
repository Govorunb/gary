<script lang="ts">
    import '../global.css';
    import { onDestroy } from 'svelte';
    import type { LayoutProps } from './$types.js';
    import { Toaster } from "svelte-sonner";
    import { getSession, getUserPrefs, initDI } from '$lib/app/utils/di';
    import dayjs from 'dayjs';
    import relativeTime from "dayjs/plugin/relativeTime";
    import { registerAppHotkey } from '$lib/app/utils/hotkeys.svelte';
    import { clearLocalStorage } from '$lib/app/utils';

    dayjs.extend(relativeTime);

    let { data, children }: LayoutProps = $props();

    // svelte-ignore state_referenced_locally
    initDI(data.userPrefsData);
    const session = getSession();
    onDestroy(() => session.dispose());
    // debugging
    (window as any).SESSION = session;
    (window as any).CONTEXT = session.context;
    (window as any).SCHEDULER = session.scheduler;
    (window as any).REGISTRY = session.registry;
    (window as any).USER_PREFS = session.userPrefs;

    // delete localstorage (dev hotkey)
    registerAppHotkey(['Backspace', 'Delete', 'Shift', 'L'], clearLocalStorage);
</script>

<div class="flex flex-col h-screen" role="application">
    {@render children()}
</div>

<Toaster closeButton richColors position="bottom-right" theme={session.userPrefs.app.theme} duration={10000} />
