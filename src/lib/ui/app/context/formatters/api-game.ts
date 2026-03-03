import type { ContextFormatterMap } from "./types";

function short(id: string) {
    return id.substring(0, 8);
}

export const API_GAME_CONTEXT_FORMATTERS = {
    "api/game/connected": (event) => ({
        source: { type: "system" },
        silent: true,
        text: `${event.data.game.name} connected`,
    }),
    "api/game/disconnected": (event) => ({
        source: { type: "system" },
        silent: true,
        text: `${event.data.game.name} disconnected`,
    }),
    "api/game/context": (event) => ({
        source: { type: "client", id: event.data.game.id, name: event.data.game.name },
        silent: event.data.silent,
        text: event.data.message,
    }),
    "api/game/force": (event) => ({
        source: { type: "client", id: event.data.game.id, name: event.data.game.name },
        silent: "noAct",
        text: `You must perform one of the following actions, given this information: ${JSON.stringify({
            actions: event.data.action_names,
            query: event.data.query,
            state: event.data.state,
        })}`,
    }),
    "api/game/act/user": (event) => ({
        source: { type: "user" },
        silent: true,
        text: `User act to ${event.data.game.name} (request ID ${short(event.data.act.id)}): ${event.data.act.name}`
            + (event.data.act.data ? `\nData: ${event.data.act.data}` : " (no data)"),
    }),
    "api/game/act/actor": (event) => ({
        source: { type: "system" },
        silent: true,
        text: `Executing action ${event.data.act.name} (Request ID: ${short(event.data.act.id)})`,
    }),
    "api/game/action_result": (event) => ({
        source: { type: "client", id: event.data.game.id, name: event.data.game.name },
        silent: event.data.success || "noAct",
        text: `Result for action ${event.data.act.name} (request ID ${short(event.data.act.id)}): ${event.data.success ? "Performing" : "Failure"}`
            + (event.data.message ? ` (${event.data.message})` : " (no message)"),
    }),
} as const satisfies ContextFormatterMap;
