import type { ContextEventFormatter } from "./types";

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch (err) {
        return `<unserializable: ${err}>`;
    }
}

export const FALLBACK_CONTEXT_FORMATTER: ContextEventFormatter = (event) => ({
    text: `[${event.key}] ${safeStringify(event.data)}`,
});
