import type { ContextFormatterMap } from "./types";

function short(id: string) {
    return id.substring(0, 8);
}

export const SCHEDULER_CONTEXT_FORMATTERS = {
    "api/actor/skip": () => ({
        text: "Engine chose not to act",
    }),
    "api/actor/say": (event) => ({
        text: `Gary ${event.data.notify ? "wants attention" : "says"}: ${event.data.msg}`,
    }),
    "api/actor/act": (event) => ({
        text: `Act${event.data.force ? " (forced)" : ""}: ${event.data.act.name} (ID ${short(event.data.act.id)})`
            + (event.data.act.data ? `\nData: ${event.data.act.data}` : " (no data)"),
    }),
    "api/actor/generated": (event, _msg, target) => {
        if (target !== "actor") {
            return null;
        }
        return {
            text: event.data.text,
        };
    },
} as const satisfies ContextFormatterMap;
