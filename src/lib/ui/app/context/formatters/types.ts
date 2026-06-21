import type { EventInstance, EventKey } from "$lib/app/events";

export type ContextFormatTarget = "user" | "actor";

export type ContextSource =
    | { type: "system" }
    | { type: "client"; id: string; name: string }
    | { type: "actor"; engineId: string }
    | { type: "user" };

export type ContextFormatOutput = {
    source: ContextSource;
    silent: boolean | "noAct";
    text: string;
    title?: string;
};

export type ContextEventFormatter<K extends EventKey = EventKey> = (
    event: EventInstance<K>,
    target: ContextFormatTarget,
) => ContextFormatOutput | null;

export type ContextFormatterMap = Partial<{
    [K in EventKey]: ContextEventFormatter<K>;
}>;
