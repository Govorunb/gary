import z from "zod";
import { LogLevel, type ToastOptions } from "$lib/app/utils/reporting";
import { MY_EVENTS as BUS_EVENTS } from "./bus";
import { EVENTS as WS_SERVER_EVENTS } from "$lib/app/server.svelte";
import { EVENTS as PREFS_EVENTS } from "$lib/app/prefs.svelte";
import { EVENTS as SESSION_EVENTS } from "$lib/app/session.svelte";
import { EVENTS as CONN_EVENTS } from "$lib/api/connection";
import { EVENTS as DIAG_EVENTS } from "$lib/api/game-diagnostics.svelte";
import { EVENTS as GAME_EVENTS } from "$lib/api/game.svelte";
import { EVENTS as SCHEMA_TEST_EVENTS } from "$lib/app/schema-test";
import { EVENTS as REGISTRY_EVENTS } from "$lib/api/registry.svelte";
import { EVENTS as MIGRATIONS_EVENTS } from "$lib/app/utils/migrations";
import { EVENTS as SCHED_EVENTS, ACT_EVENTS, DISPLAY as SCHED_PRESENT } from "$lib/app/scheduler.svelte";
import { EVENTS as UPDATER_EVENTS } from "$lib/app/updater.svelte";
import { EVENTS as UI_EVENTS } from "$lib/ui/events";

export interface EventDef<Prefix extends string = ''> {
    key: Prefix extends '' ? string : `${Prefix}/${string}`;
    // TODO: {} as MyType (then no zod)
    dataSchema?: z.ZodType;
    description?: string;
    /** Default log level for the event. Used for toasts. */
    level?: LogLevel; // default Info
}

// if not defined, defaults to eventDescription
export type EventPresent<K extends EventKey> = 
    | string // title only
    | ((data: EventData<K>) => string | ToastOptions);

export type Keys<E extends EventDef[]> = E[number]['key'];
export type PresentDefs<K extends EventKey> = {
    [k in K]?: EventPresent<k>
};

export const EVENTS = [
    {
        key: 'i_have_no_event_and_i_must_log',
        dataSchema: z.strictObject({
            msg: z.string(),
            details: z.string().optional(),
            ctx: z.any(),
            levelOverride: z.enum(LogLevel).optional(),
        }),
        level: LogLevel.Debug,
    },
    {
        key: 'test1',
        dataSchema: z.null(),
        level: LogLevel.Verbose,
    },
    {
        key: 'test2',
        level: LogLevel.Verbose,
    },
    {
        key: 'test3',
        dataSchema: z.never(),
        level: LogLevel.Verbose,
    },
    ...BUS_EVENTS,
    ...WS_SERVER_EVENTS,
    ...PREFS_EVENTS,
    ...SESSION_EVENTS,
    ...CONN_EVENTS,
    ...DIAG_EVENTS,
    ...GAME_EVENTS,
    ...SCHEMA_TEST_EVENTS,
    ...REGISTRY_EVENTS,
    ...MIGRATIONS_EVENTS,
    ...SCHED_EVENTS,
    ...ACT_EVENTS,
    ...UPDATER_EVENTS,
    ...UI_EVENTS,
] as const satisfies EventDef[];

export type Events = typeof EVENTS[number];
export type EventKey = Events['key'];

export const EVENTS_BY_KEY = Object.fromEntries(
    EVENTS.map(d => [d.key, d]) as [EventKey, EventDef][]
) as { [K in EventKey]: EventByKey<K> };

export type EventByKey<K extends EventKey> = Extract<Events, { key: K }>;

export type EventData<K extends EventKey> = 'dataSchema' extends keyof EventByKey<K>
    ? z.infer<EventByKey<K>['dataSchema']>
    : never;

export type DatalessKey = Extract<Events, { key: EventKey, dataSchema?: never }>['key'];
export type HasDataKey = Exclude<EventKey, DatalessKey>;

export type EventInstances = {
    [K in EventKey]: {
        readonly id: string,
        readonly timestamp: number,
        readonly key: K,
        readonly data: EventData<K>,
    }
}[EventKey];

export type EventInstance<K extends EventKey> = Extract<EventInstances, { key: K }>;

export const EVENTS_DISPLAY = {
    ...SCHED_PRESENT,
} as PresentDefs<EventKey>;
