import { createContext } from "svelte";
import { Session } from "../session.svelte";
import type { Registry } from "$lib/api/registry.svelte";
import { UserPrefs, type UserPrefsData } from "../prefs.svelte";
import type { Scheduler } from "../scheduler.svelte";
import { ServerManager } from "../server.svelte";
import { Updater } from "../updater.svelte";
import { ThemeManager } from "../theme.svelte";
import type { Result } from "neverthrow";
import type { UIState } from "$lib/ui/app/ui-state.svelte";

const [ getUserPrefs, setUserPrefs ] = createContext<UserPrefs>();
const [ getSession, setSession ] = createContext<Session>();
const [ getRegistry, setRegistry ] = createContext<Registry>();
const [ getScheduler, setScheduler ] = createContext<Scheduler>();
const [ getServerManager, setServerManager ] = createContext<ServerManager>();
const [ getUIState, setUIState ] = createContext<UIState>();
const [ getUpdater, setUpdater ] = createContext<Updater>();
const [ getThemeManager, setThemeManager ] = createContext<ThemeManager>();

export {
    getUserPrefs,
    getSession,
    getRegistry,
    getScheduler,
    getServerManager,
    getUIState,
    getUpdater,
    getThemeManager,
}

export function initDI(prefsLoadRes: Result<UserPrefsData, string>) {
    const userPrefs = new UserPrefs(prefsLoadRes);
    const session = new Session("default", userPrefs);
    const registry = session.registry;
    const scheduler = session.scheduler;
    const serverManager = new ServerManager(session, userPrefs);
    const uiState = session.uiState;
    const updater = new Updater(userPrefs, uiState);
    const themeManager = new ThemeManager(userPrefs);

    setUserPrefs(userPrefs);
    setSession(session);
    setRegistry(registry);
    setScheduler(scheduler);
    setServerManager(serverManager);
    setUIState(uiState);
    setUpdater(updater);
    setThemeManager(themeManager);
}
