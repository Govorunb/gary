import type z from "zod";
import { LogLevel } from "$lib/app/utils/reporting";
import type { ReportOptions, ToastOptions } from "$lib/app/utils/reporting";
import { MY_EVENTS as BUS_EVENTS } from "./bus";
import { EVENTS as WS_SERVER_EVENTS } from "$lib/app/server.svelte";
import { EVENTS as PREFS_EVENTS } from "$lib/app/prefs.svelte";
import { EVENTS as SESSION_EVENTS } from "$lib/app/session.svelte";
import { EVENTS as CONN_EVENTS } from "$lib/api/connection";
import { EVENTS as CLIENT_GAME_EVENTS } from "$lib/api/client-game";
import { EVENTS as DIAG_EVENTS } from "$lib/api/game-diagnostics.svelte";
import { EVENTS as GAME_EVENTS } from "$lib/api/game.svelte";
import { EVENTS as SCHEMA_TEST_EVENTS } from "$lib/app/schema-test";
import { EVENTS as REGISTRY_EVENTS } from "$lib/api/registry.svelte";
import { EVENTS as MIGRATIONS_EVENTS } from "$lib/app/utils/migrations";
import { EVENTS as SCHED_EVENTS, ACT_EVENTS, DISPLAY as SCHED_PRESENT } from "$lib/app/scheduler.svelte";
import { EVENTS as UPDATER_EVENTS } from "$lib/app/updater.svelte";
import { EVENTS as LLM_EVENTS } from "$lib/app/engines/llm/openai.svelte";
import { EVENTS as UI_EVENTS } from "$lib/ui/events";

export interface EventDef<Prefix extends string = ''> {
    /** Unique key signifying the event type.
     * Convention is to format it like a tree path, e.g. `app/scheduler/idle/poke`.
    */
    key: Prefix extends '' ? string : `${Prefix}/${string}`;
    /** Schema for the event's data.  
     * This can be either a `z.object({...})` or `{} as MyType` (a type system trick).  
     * We only really care about the type (it's defined `as const` for inference)
     * so in simple situations `{} as MyType` will work fine.  
     * Use zod if you need to annotate fields (e.g. `.default()` or `.sensitive()`).
    */
    dataSchema?: any;
    description?: string;
    /** Default log level for the event. Used for display (toasts, event log). */
    level?: LogLevel; // default Info
}

// if not defined, defaults to eventDescription
export type EventPresenter<K extends EventKey> = 
    | string // title only
    | ((data: EventData<K>) => string | ToastOptions);

export type Keys<E extends EventDef[]> = E[number]['key'];
export type PresentDefs<K extends EventKey> = {
    [k in K]?: EventPresenter<k>
};

export const EVENTS = [
    {
        key: 'i_have_no_event_and_i_must_log',
        dataSchema: {} as ReportOptions & { level?: LogLevel },
        level: LogLevel.Debug,
    },
    {
        key: 'test1',
        dataSchema: null,
        level: LogLevel.Verbose,
    },
    {
        key: 'test2',
        level: LogLevel.Verbose,
    },
    {
        key: 'test3',
        dataSchema: {} as never,
        level: LogLevel.Verbose,
    },
    ...BUS_EVENTS,
    ...WS_SERVER_EVENTS,
    ...PREFS_EVENTS,
    ...SESSION_EVENTS,
    ...CONN_EVENTS,
    ...CLIENT_GAME_EVENTS,
    ...DIAG_EVENTS,
    ...GAME_EVENTS,
    ...SCHEMA_TEST_EVENTS,
    ...REGISTRY_EVENTS,
    ...MIGRATIONS_EVENTS,
    ...SCHED_EVENTS,
    ...ACT_EVENTS,
    ...UPDATER_EVENTS,
    ...LLM_EVENTS,
    ...UI_EVENTS,
] as const satisfies EventDef[];

export type Events = typeof EVENTS[number];
export type EventKey = Events['key'];

export const EVENTS_BY_KEY = Object.fromEntries(
    EVENTS.map(d => [d.key, d]) as [EventKey, EventDef][]
) as { [K in EventKey]: EventByKey<K> };

export type EventByKey<K extends EventKey> = Extract<Events, { key: K }>;

export type EventData<K extends EventKey> = 'dataSchema' extends keyof EventByKey<K>
    ? UnwrapZod<EventByKey<K>['dataSchema']>
    : never;

export type DatalessKey = Extract<Events, { key: EventKey, dataSchema?: never }>['key'];
export type HasDataKey = Exclude<EventKey, DatalessKey>;
export type UnwrapZod<T> = T extends z.ZodType ? z.infer<T> : T;

export type EventInstances = {
    [K in EventKey]: {
        readonly id: string,
        readonly timestamp: number,
        readonly key: K,
        readonly data: EventData<K>,
        readonly levelOverride?: LogLevel,
    }
}[EventKey];

export type EventInstance<K extends EventKey> = Extract<EventInstances, { key: K }>;

export const EVENTS_DISPLAY = {
    ...SCHED_PRESENT,
} as PresentDefs<EventKey>;
