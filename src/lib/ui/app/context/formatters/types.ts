import type { Message } from "$lib/app/context.svelte";
import type { EventInstance, EventKey } from "$lib/app/events";

export type ContextFormatTarget = "user" | "actor";

export type ContextFormatOutput = {
    text: string;
    title?: string;
};

export type ContextEventFormatter<K extends EventKey = EventKey> = (
    event: EventInstance<K>,
    msg: Message,
    target: ContextFormatTarget,
) => ContextFormatOutput | null;

export type ContextFormatterMap = Partial<{
    [K in EventKey]: ContextEventFormatter<K>;
}>;
