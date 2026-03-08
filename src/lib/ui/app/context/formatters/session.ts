import type { ContextFormatterMap } from "./types";

export const SESSION_CONTEXT_FORMATTERS = {
    "ui/context/input": (event) => ({
        source: { type: "user" },
        silent: event.data.silent,
        text: event.data.text,
    }),
} as const satisfies ContextFormatterMap;
