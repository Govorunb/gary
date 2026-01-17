import z from "zod";
import { LogLevel } from "../utils/reporting";
import { MY_EVENTS as BUS_EVENTS } from "./bus";

export interface EventDef {
    key: string;
    dataSchema?: z.ZodType;
    description?: string;
    level?: LogLevel; // default Info
}

export const EVENTS = [
    {
        key: 'log',
        dataSchema: z.strictObject({
            logMsg: z.string(),
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
