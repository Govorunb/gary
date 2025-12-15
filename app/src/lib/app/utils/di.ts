import { createContext } from "svelte";
import { Session } from "../session.svelte";
import type { Registry } from "$lib/api/registry.svelte";
import { UserPrefs, type UserPrefsData } from "../prefs.svelte";
import type { Scheduler } from "../scheduler.svelte";
import { ServerManager } from "../server.svelte";
import { UIState } from "$lib/ui/app/ui-state.svelte";
import { Updater } from "../updater.svelte";

const [ getUserPrefs, setUserPrefs ] = createContext<UserPrefs>();
const [ getSession, setSession ] = createContext<Session>();
const [ getRegistry, setRegistry ] = createContext<Registry>();
const [ getScheduler, setScheduler ] = createContext<Scheduler>();
const [ getServerManager, setServerManager ] = createContext<ServerManager>();
const [ getUIState, setUIState ] = createContext<UIState>();
const [ getUpdater, setUpdater ] = createContext<Updater>();

export {
    getUserPrefs,
    getSession,
    getRegistry,
    getScheduler,
    getServerManager,
    getUIState,
    getUpdater,
}

export function initDI(userPrefsData: UserPrefsData) {
    const userPrefs = new UserPrefs(userPrefsData);
    const session = new Session("default", userPrefs);
    const registry = session.registry;
    const scheduler = session.scheduler;
    const serverManager = new ServerManager(session, userPrefs);
    const uiState = new UIState(session);
    const updater = new Updater(userPrefs);

    setUserPrefs(userPrefs);
    setSession(session);
    setRegistry(registry);
    setScheduler(scheduler);
    setServerManager(serverManager);
    setUIState(uiState);
    setUpdater(updater);
}
