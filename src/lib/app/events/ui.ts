import z from "zod";
import type { EventDef } from "./";

export const EVENTS = [
    {
        key: 'ui/game/send_raw/sent',
        dataSchema: z.object({
            gameId: z.string(),
        }),
    },
    {
        key: 'ui/game/send_raw/error',
        dataSchema: z.object({
            gameId: z.string(),
            error: z.custom<Error>(),
        }),
    },
    {
        key: 'ui/game/user_act/send',
        dataSchema: z.object({
            gameId: z.string(),
            actionName: z.string(),
            hasData: z.boolean(),
        }),
    },
    {
        key: 'ui/game/user_act/generate_error',
        dataSchema: z.object({
            gameId: z.string(),
            actionName: z.string(),
            error: z.custom<Error>(),
        }),
    },
    {
        key: 'ui/game/user_act/send_error',
        dataSchema: z.object({
            gameId: z.string(),
            actionName: z.string(),
            error: z.custom<Error>(),
        }),
    },
    {
        key: 'ui/server/toggle_failed',
        dataSchema: z.object({
            wasRunning: z.boolean(),
            error: z.string(),
        }),
    },
    {
        key: 'ui/update/installed',
        dataSchema: z.object({
            version: z.string(),
        }),
    },
] as const satisfies EventDef<'ui'>[];
