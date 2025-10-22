import { createContext } from "svelte";
import { Session } from "../session.svelte";
import type { Registry } from "$lib/api/registry.svelte";
import { UserPrefs, type UserPrefsData } from "../prefs.svelte";
import type { Scheduler } from "../scheduler.svelte";
import { ServerManager } from "../server.svelte";
import type { OpenRouter } from "@openrouter/sdk";

const [ getUserPrefs, setUserPrefs ] = createContext<UserPrefs>();
const [ getSession, setSession ] = createContext<Session>();
const [ getRegistry, setRegistry ] = createContext<Registry>();
const [ getScheduler, setScheduler ] = createContext<Scheduler>();
const [ getServerManager, setServerManager ] = createContext<ServerManager>();
const [ getOpenRouterClient, setOpenRouterClient ] = createContext<OpenRouter>();

export {
    getUserPrefs,
    getSession,
    getRegistry,
    getScheduler,
    getServerManager,
    getOpenRouterClient,
}

export function initDI(userPrefsData: UserPrefsData) {
    const userPrefs = new UserPrefs(userPrefsData);
    const session = new Session("default");
    const registry = session.registry;
    const scheduler = session.scheduler;
    const serverManager = new ServerManager(session, userPrefs);

    setUserPrefs(userPrefs);
    setSession(session);
    setRegistry(registry);
    setScheduler(scheduler);
    setServerManager(serverManager);
}
