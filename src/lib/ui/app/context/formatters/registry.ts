import { getMessageEvent, type Message } from "$lib/app/context.svelte";
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

export function formatContextMessage(msg: Message, target: ContextFormatTarget): ContextFormatOutput {
    const event = getMessageEvent(msg);
    if (!event) {
        return { text: msg.text };
    }

    const formatter = (CONTEXT_FORMATTERS as ContextFormatterMap)[event.key] ?? FALLBACK_CONTEXT_FORMATTER;
    const formatted = formatter(event as never, msg, target);
    if (formatted) {
        return formatted;
    }
    return FALLBACK_CONTEXT_FORMATTER(event as never, msg, target) ?? { text: msg.text };
}
