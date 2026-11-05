import type { ContextFormatterMap } from "./types";

function short(id: string) {
    return id.substring(0, 8);
}

export const SCHEDULER_CONTEXT_FORMATTERS = {
    "api/actor/skip": (event) => ({
        source: { type: "actor", engineId: event.data.engineId },
        silent: true,
        text: "Engine chose not to act",
        metrics: event.data.metrics,
    }),
    "api/actor/say": (event) => ({
        source: { type: "actor", engineId: event.data.engineId },
        silent: !event.data.notify,
        text: `Gary ${event.data.notify ? "wants attention" : "says"}: ${event.data.msg}`,
        metrics: event.data.metrics,
    }),
    "api/actor/act": (event) => {
        const tags = [event.data.force ? "forced" : "", ...event.data.issues].filter(Boolean);
        return {
            source: { type: "actor", engineId: event.data.engineId },
            silent: false,
            text: `Act${tags.length ? ` (${tags.join(", ")})` : ""}: ${event.data.act.name} (ID ${short(event.data.act.id)})`
                + (event.data.act.data ? `\nData: ${event.data.act.data}` : " (no data)"),
            metrics: event.data.metrics,
        };
    },
    "api/actor/generated": (event, target) => {
        if (target !== "actor") {
            return null;
        }
        return {
            source: { type: "actor", engineId: event.data.engineId },
            silent: true,
            text: event.data.text,
        };
    },
} as const satisfies ContextFormatterMap;
