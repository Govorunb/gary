import type { ContextFormatterMap } from "./types";

function short(id: string) {
    return id.substring(0, 8);
}

export const API_GAME_CONTEXT_FORMATTERS = {
    "api/game/connected": (event) => ({
        text: `${event.data.game.name} connected`,
    }),
    "api/game/disconnected": (event) => ({
        text: `${event.data.game.name} disconnected`,
    }),
    "api/game/context": (event) => ({
        text: event.data.message,
    }),
    "api/game/force": (event) => ({
        text: `You must perform one of the following actions, given this information: ${JSON.stringify({
            actions: event.data.action_names,
            query: event.data.query,
            state: event.data.state,
        })}`,
    }),
    "api/game/act/user": (event) => ({
        text: `User act to ${event.data.game.name} (request ID ${short(event.data.act.id)}): ${event.data.act.name}`
            + (event.data.act.data ? `\nData: ${event.data.act.data}` : " (no data)"),
    }),
    "api/game/act/actor": (event) => ({
        text: `Executing action ${event.data.act.name} (Request ID: ${short(event.data.act.id)})`,
    }),
    "api/game/action_result": (event) => ({
        text: `Result for action ${event.data.act.name} (request ID ${short(event.data.act.id)}): ${event.data.success ? "Performing" : "Failure"}`
            + (event.data.message ? ` (${event.data.message})` : " (no message)"),
    }),
} as const satisfies ContextFormatterMap;
