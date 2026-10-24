import z from "zod";
import { EVENTS_BY_KEY, exportReplacer, type EventDef, type EventInstance, type EventKey } from "./events";
import { formatZodError, jsonParse, safeParse } from "./utils";

/** An event as saved. Payloads are checked against their event's zod schema; events defined only as TS types are kept as they are. */
const zEvent = z.strictObject({
    id: z.string(),
    timestamp: z.number(),
    key: z.string(),
    data: z.unknown().optional(),
}).transform((event, ctx) => {
    if (!Object.hasOwn(EVENTS_BY_KEY, event.key)) {
        ctx.addIssue({ code: "custom", path: ["key"], message: `Unknown event '${event.key}'` });
        return z.NEVER;
    }
    const schema = (EVENTS_BY_KEY[event.key as EventKey] as EventDef).dataSchema;
    if (!(schema instanceof z.ZodType)) return event as EventInstance<EventKey>;
    const data = schema.safeParse(event.data);
    if (!data.success) {
        for (const issue of data.error.issues) ctx.addIssue({ ...issue, path: ["data", ...issue.path] } as z.core.$ZodRawIssue);
        return z.NEVER;
    }
    return { ...event, data: data.data } as EventInstance<EventKey>;
});

/** A session's first event is its creation, which carries the session's ID. */
const zCreated = zEvent.refine(event => event.key === "app/session/created", "A session starts with its creation event")
    .transform(event => event as EventInstance<"app/session/created">);

export const zSessionFile = z.strictObject({
    version: z.literal(1),
    events: z.tuple([zCreated], zEvent).superRefine((events, ctx) => {
        const ids = new Set<string>();
        const games = new Set<string>();
        for (const [i, event] of events.entries()) {
            if (ids.has(event.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: `Event ID '${event.id}' is used twice` });
            ids.add(event.id);
            if (event.key !== "api/registry/game_created") continue;
            if (games.has(event.data.game.id)) ctx.addIssue({ code: "custom", path: [i, "data"], message: `Game '${event.data.game.id}' is created twice` });
            games.add(event.data.game.id);
        }
    }),
});
export type SessionFile = z.infer<typeof zSessionFile>;

/** A saved session holds its events as they are, provider requests and responses included. Like every other export, it has `secrets` scrubbed from its strings. */
export function sessionJson(file: SessionFile, secrets: readonly string[]) {
    return JSON.stringify(file, exportReplacer(secrets), 2);
}

export function parseJson<T>(schema: z.ZodType<T>, text: string) {
    return jsonParse(text).mapErr(e => e.message)
        .andThen(json => safeParse(schema, json).mapErr(e => formatZodError(e).join("\n")));
}
