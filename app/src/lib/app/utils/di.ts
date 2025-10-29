import { createContext } from "svelte";
import { Session } from "../session.svelte";
import type { Registry } from "$lib/api/registry.svelte";
import { UserPrefs, type UserPrefsData } from "../prefs.svelte";
import type { Scheduler } from "../scheduler.svelte";
import { ServerManager } from "../server.svelte";
import { Randy } from "../engines/randy.svelte";
import { OpenRouter } from "../engines/llm/openrouter.svelte";

const [ getUserPrefs, setUserPrefs ] = createContext<UserPrefs>();
const [ getSession, setSession ] = createContext<Session>();
const [ getRegistry, setRegistry ] = createContext<Registry>();
const [ getScheduler, setScheduler ] = createContext<Scheduler>();
const [ getServerManager, setServerManager ] = createContext<ServerManager>();
const [ getRandy, setRandy ] = createContext<Randy>();
const [ getOpenRouter, setOpenRouter ] = createContext<OpenRouter>();

export {
    getUserPrefs,
    getSession,
    getRegistry,
    getScheduler,
    getServerManager,
    getRandy,
    getOpenRouter,
}

export function initDI(userPrefsData: UserPrefsData) {
    const userPrefs = new UserPrefs(userPrefsData);
    const session = new Session("default", userPrefs);
    const registry = session.registry;
    const scheduler = session.scheduler;
    const serverManager = new ServerManager(session, userPrefs);
    const randy = new Randy(userPrefs);
    const openrouter = new OpenRouter(userPrefs);

    setUserPrefs(userPrefs);
    setSession(session);
    setRegistry(registry);
    setScheduler(scheduler);
    setServerManager(serverManager);
    setRandy(randy);
    setOpenRouter(openrouter);
}
