import type { EventInstance, EventKey } from "$lib/app/events";
import type { ContextFormatOutput, ContextFormatTarget, ContextFormatterMap } from "./types";
import { API_GAME_CONTEXT_FORMATTERS } from "./api-game";
import { SCHEDULER_CONTEXT_FORMATTERS } from "./scheduler";
import { SESSION_CONTEXT_FORMATTERS } from "./session";
import { FALLBACK_CONTEXT_FORMATTER } from "./fallback";

export const CONTEXT_FORMATTERS = {
    ...API_GAME_CONTEXT_FORMATTERS,
    ...SCHEDULER_CONTEXT_FORMATTERS,
    ...SESSION_CONTEXT_FORMATTERS,
} as const satisfies ContextFormatterMap;

export function formatContextEvent(event: EventInstance<EventKey>, target: ContextFormatTarget): ContextFormatOutput | null {
    const formatter = (CONTEXT_FORMATTERS as ContextFormatterMap)[event.key] ?? FALLBACK_CONTEXT_FORMATTER;
    const formatted = formatter(event as never, target);
    if (formatted) {
        return formatted;
    }
    return FALLBACK_CONTEXT_FORMATTER(event as never, target);
}
