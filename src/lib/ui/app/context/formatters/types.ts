import type { EventInstance, EventKey } from "$lib/app/events";
import type { UserContextEvent } from "$lib/app/context.svelte";
import type { ActMetrics } from "$lib/app/scheduler.svelte";

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
    /** Shown on hover or with the details modifier, for model rows. */
    metrics?: ActMetrics;
};

/** One rendered row of the context log, with the bookkeeping the row component needs. */
export type ContextRow = {
    event: UserContextEvent;
    rendered: ContextFormatOutput | null;
    source: ContextSource;
    /** True when the previous row came from the same source, so the header is dropped. */
    continues: boolean;
};

export type ContextEventFormatter<K extends EventKey = EventKey> = (
    event: EventInstance<K>,
    target: ContextFormatTarget,
) => ContextFormatOutput | null;

export type ContextFormatterMap = Partial<{
    [K in EventKey]: ContextEventFormatter<K>;
}>;
