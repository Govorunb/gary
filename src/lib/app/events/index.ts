import z from "zod";
import { LogLevel } from "../utils/reporting";

export interface EventDef {
    key: string;
    dataSchema: z.ZodType;
    description?: string;
    level?: LogLevel; // default Info
}

export const EVENTS = [
    {
        key: 'i_am_a_lazy_dev',
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
        dataSchema: z.null(),
        level: LogLevel.Verbose,
    },
    {
        key: 'test3',
        dataSchema: z.null(),
        level: LogLevel.Verbose,
    },
] as const satisfies EventDef[];

export type Events = typeof EVENTS[number];
export type EventKey = Events['key'];

export type EventByKey<K extends EventKey> = Extract<Events, { key: K }>;

export type EventData<K extends EventKey> = z.infer<EventByKey<K>['dataSchema']>;

export interface EventInstance<K extends EventKey> {
    readonly id: string,
    readonly timestamp: number,
    readonly key: K,
    readonly data: EventData<K>,
}
