<script lang="ts">
    import '../global.css';
    import { onDestroy } from 'svelte';
    import type { LayoutProps } from './$types.js';
    import { Toaster } from "svelte-sonner";
    import { getSession, initDI } from '$lib/app/utils/di';
    import dayjs from 'dayjs';
    import relativeTime from "dayjs/plugin/relativeTime";
    import localizedTime from "dayjs/plugin/localizedFormat";
    import { registerAppHotkey } from '$lib/app/utils/hotkeys.svelte';
    import { clearLocalStorage } from '$lib/app/utils';
    import SafeModeDialog from '$lib/ui/app/SafeModeDialog.svelte';
    import { USER_PREFS } from '$lib/app/prefs.svelte';

    dayjs.extend(relativeTime);
    dayjs.extend(localizedTime);

    let { data, children }: LayoutProps = $props();

    // svelte-ignore state_referenced_locally
    initDI(data.userPrefsData);
    const session = getSession();
    onDestroy(() => session.dispose());
    // debugging
    const __global = window as any;
    __global.SESSION = session;
    __global.CONTEXT = session.context;
    __global.SCHEDULER = session.scheduler;
    __global.REGISTRY = session.registry;
    __global.USER_PREFS = session.userPrefs;

    // delete localstorage (dev hotkey)
    registerAppHotkey(['Backspace', 'Delete', 'Shift', 'L'], clearLocalStorage);
</script>

<div class="flex flex-col h-screen" role="application">
    {@render children()}
</div>

<Toaster closeButton richColors position="bottom-right" theme={session.userPrefs.app.theme} duration={10000} />
<SafeModeDialog />
