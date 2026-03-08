import z from "zod";
import type { EventDef } from "$lib/app/events";
import { LogLevel } from "$lib/app/utils";

export const EVENTS = [
    {
        key: 'ui/context/input',
        dataSchema: z.object({
            text: z.string(),
            silent: z.boolean(),
        }),
        level: LogLevel.Info,
    },
    {
        key: 'ui/game/send_raw/sent',
        dataSchema: z.object({
            gameId: z.string(),
        }),
        level: LogLevel.Success,
    },
    {
        key: 'ui/game/send_raw/error',
        dataSchema: z.object({
            gameId: z.string(),
            error: z.custom<Error>(),
        }),
        level: LogLevel.Error,
    },
    {
        key: 'ui/game/user_act/send',
        dataSchema: z.object({
            gameId: z.string(),
            actionName: z.string(),
            hasData: z.boolean(),
        }),
        level: LogLevel.Info,
    },
    {
        key: 'ui/game/user_act/generate_error',
        dataSchema: z.object({
            gameId: z.string(),
            actionName: z.string(),
            error: z.custom<Error>(),
        }),
        level: LogLevel.Error,
    },
    {
        key: 'ui/game/user_act/send_error',
        dataSchema: z.object({
            gameId: z.string(),
            actionName: z.string(),
            error: z.custom<Error>(),
        }),
        level: LogLevel.Error,
    },
    {
        key: 'ui/server/toggle_failed',
        dataSchema: z.object({
            wasRunning: z.boolean(),
            error: z.string(),
        }),
        level: LogLevel.Error,
    },
    {
        key: 'ui/update/installed',
        dataSchema: z.object({
            version: z.string(),
        }),
        level: LogLevel.Success,
    },
] as const satisfies EventDef<'ui'>[];
