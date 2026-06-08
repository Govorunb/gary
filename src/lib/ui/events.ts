import z from "zod";
import type { EventDef, Keys, PresentDefs } from "$lib/app/events";
import { LogLevel } from "$lib/app/utils";

export const EVENTS = [
    {
        key: 'ui/context/input',
        dataSchema: z.object({
            text: z.string(),
            silent: z.boolean(),
        }),
        description: "User added context",
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
            gameName: z.string(),
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
        description: "User sent an action",
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
        description: "Update installed",
        level: LogLevel.Success,
    },
] as const satisfies EventDef<'ui'>[];

export const DISPLAY = {
    "ui/game/send_raw/sent": () => ({
        title: "Sent raw WebSocket message",
    }),
    "ui/game/send_raw/error": ({ gameName, error }) => ({
        title: `Failed to send raw message to ${gameName}`,
        description: `${error}`,
    }),
    "ui/game/user_act/generate_error": ({ actionName, error }) => ({
        title: `Could not generate random data for ${actionName}`,
        description: `${error}`,
    }),
    "ui/game/user_act/send_error": ({ actionName, error }) => ({
        title: `Failed to send action ${actionName}`,
        description: `${error}`,
    }),
    "ui/server/toggle_failed": ({ wasRunning, error }) => ({
        title: `Failed to ${wasRunning ? "stop" : "start"} server`,
        description: error,
        id: "server-start-error",
    }),
} as PresentDefs<Keys<typeof EVENTS>>;
