import { UserPrefs } from "$lib/app/prefs.svelte";
import type { LayoutLoad } from "./$types";

// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
export const ssr = false;
export const prerender = false;
export const csr = true;

// afaik the only way to do async init
// technically blocks the initial render so is it really async anyway
export const load: LayoutLoad = async () => {
    return {
        userPrefsData: await UserPrefs.loadData(),
    }
}