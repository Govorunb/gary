import { McpServer, WebStandardStreamableHTTPServerTransport, type CallToolResult, type StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { err, ok, type Result } from "neverthrow";
import z from "zod";
import type { Session } from "./session.svelte";
import { COMMANDS, type AgentCommand } from "./commands";
import { exportReplacer, eventLevel, redactEvent, type EventInstance, type EventKey } from "./events";
import { APP_VERSION, LogLevel, type Awaitable } from "./utils";
import { scrubSecrets } from "./events/sensitive";
import { DIAGNOSTICS_BY_KEY, DiagnosticSeverity } from "#lib/api/diagnostics.js";
import { formatContextEvent } from "#lib/ui/app/context/formatters/registry.js";

/** An HTTP request to `/mcp`, relayed by the Rust server. */
export type McpHttpRequest = { headers: [string, string][]; body: string };
export type McpHttpResponse = { status: number; headers: [string, string][]; body: string };

const MAX_CALL_MS = 50_000; // the Rust relay gives up at 55s

const INSTRUCTIONS = `\
Gary is a test backend for Neuro-sama SDK game integrations. Games connect to it, register actions and send context; an engine (an LLM, or Randy, a random generator) acts on them. You can observe the session and act as the user.

Every successful tool result has a \`cursor\`, the position in Gary's event log when the tool ran. Pass it as \`after\` to \`read_events\` or \`wait_for_events\` to see what happened since. For example, call \`send_action\`, then \`wait_for_events\` with its cursor and keys ["api/game/action_result"] to get the game's result together with everything that led up to it.`;

const LEVELS = {
    verbose: LogLevel.Verbose,
    debug: LogLevel.Debug,
    info: LogLevel.Info,
    warning: LogLevel.Warning,
    error: LogLevel.Error,
};
const zLevel = z.enum(Object.keys(LEVELS) as (keyof typeof LEVELS)[])
    .default("info")
    .describe("Leave out events below this level");
const zKeys = z.array(z.string()).min(1)
    .describe("Event key prefixes, e.g. 'api/game/' or 'api/game/action_result'");
const zCursor = z.int().nonnegative()
    .describe("A cursor from an earlier tool result; only events after it are considered");
const zGameId = z.string().describe("Game ID from list_games (a unique prefix is enough)");

export async function handleMcpRequest(session: Session, { headers, body }: McpHttpRequest): Promise<McpHttpResponse> {
    const server = createServer(session);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
        const res = await transport.handleRequest(new Request("http://localhost/mcp", { method: "POST", headers, body }));
        return { status: res.status, headers: [...res.headers], body: await res.text() };
    } finally {
        await server.close();
    }
}

function createServer(session: Session) {
    const server = new McpServer(
        { name: "gary", version: APP_VERSION },
        { instructions: INSTRUCTIONS, supportedProtocolVersions: ["2025-11-25", "2025-06-18"] },
    );
    const { registry, scheduler, eventLog } = session;

    // a cursor ahead of the log was handed out before Gary restarted
    const cursorError = (after?: number) => after !== undefined && after > eventLog.cursor
        ? `Cursor ${after} is from before Gary restarted. The event log is at ${eventLog.cursor} now.`
        : undefined;

    function tool<S extends z.ZodType>(
        name: string,
        description: string,
        inputSchema: S,
        // biome-ignore lint/suspicious/noConfusingVoidType: commands with nothing to report return Result<void>
        run: (args: z.infer<S>) => Awaitable<Result<object | void, string>>,
    ) {
        // the SDK's callback type can't resolve against a generic schema
        server.registerTool(name, { description, inputSchema: inputSchema as StandardSchemaWithJSON }, async (args): Promise<CallToolResult> => {
            const cursor = eventLog.cursor;
            // credentials can be replaced while a call runs, and engine errors quote the ones they were sent
            const secretsBefore = session.userPrefs.secrets;
            const result = await run(args as z.infer<S>);
            const secrets = [...secretsBefore, ...session.userPrefs.secrets];
            return result.match(
                data => ({ content: [{ type: "text", text: JSON.stringify(Object.assign({ cursor }, data), exportReplacer(secrets)) }] }),
                error => ({ content: [{ type: "text", text: scrubSecrets(error, secrets) }], isError: true }),
            );
        });
    }

    tool("list_games", "List connected games and their actions. Inactive actions were registered and later unregistered.",
        z.strictObject({}),
        () => ok({
            games: registry.games.map(game => ({
                id: game.id,
                name: game.name,
                status: game.status,
                actions: [...game.actions.values()],
            })),
        }),
    );

    tool("get_diagnostics", "List the problems Gary found in games' protocol use, oldest first.",
        z.strictObject({ game: zGameId.optional() }),
        ({ game }) => {
            const target = game === undefined ? undefined : registry.getGame(game);
            if (game !== undefined && !target) return err(`'${game}' doesn't match exactly one game ID`);
            return ok({
                games: (target ? [target] : registry.games).map(g => ({
                    id: g.id,
                    name: g.name,
                    diagnostics: g.diagnostics.diagnostics.map(({ key, timestamp, context, dismissed }) => {
                        const { severity, title, description } = DIAGNOSTICS_BY_KEY[key];
                        return { key, severity: DiagnosticSeverity[severity], title, description, timestamp, context, dismissed };
                    }),
                })),
            });
        },
    );

    tool("get_context", "Read the actor's context, oldest first: the history the engine decides from.",
        z.strictObject({ limit: z.int().positive().default(50).describe("Return only the newest entries") }),
        ({ limit }) => ok({
            context: session.context.actorView.slice(-limit).flatMap(event => {
                const row = formatContextEvent(event, "actor");
                return row ? [{ timestamp: event.timestamp, source: row.source, text: row.text }] : [];
            }),
        }),
    );

    tool("read_events", "Read the newest events from Gary's event log, oldest first.",
        z.strictObject({
            after: zCursor.optional(),
            keys: zKeys.optional(),
            minLevel: zLevel,
            limit: z.int().positive().max(500).default(50).describe("Return only the newest matching events"),
        }),
        ({ after, keys, minLevel, limit }) => {
            const error = cursorError(after);
            if (error) return err(error);
            return ok({
                events: eventLog.since(after ?? 0)
                    .filter(e => (!keys || matchesKeys(e, keys)) && eventLevel(e) >= LEVELS[minLevel])
                    .slice(-limit)
                    .map(toJson),
            });
        },
    );

    tool("wait_for_events",
        `Wait for the next event whose key starts with one of \`keys\`, then return it with the events that came before it. With \`after\`, events that already happened since that cursor count too. Gives up after \`timeoutMs\` with \`matched: null\`.`,
        z.strictObject({
            keys: zKeys,
            after: zCursor.optional(),
            timeoutMs: z.int().positive().max(MAX_CALL_MS).default(30_000),
            minLevel: zLevel,
        }),
        async ({ keys, after, timeoutMs, minLevel }) => {
            const error = cursorError(after);
            if (error) return err(error);
            const { events, matched, cursor } = await eventLog.waitFor(e => matchesKeys(e, keys), after ?? eventLog.cursor, timeoutMs);
            return ok({
                matched: matched ? toJson(matched) : null,
                events: events.filter(e => e !== matched && eventLevel(e) >= LEVELS[minLevel]).map(toJson),
                cursor,
            });
        },
    );

    tool("send_action", "Send an action to a game as the user, bypassing the engine. The game's result arrives later as an 'api/game/action_result' event.",
        z.strictObject({
            game: zGameId,
            action: z.string(),
            data: z.unknown().optional().describe("Action data matching the action's schema; omit for actions without one"),
        }),
        ({ game, action, data }) => session.sendAction(game, action, data === undefined ? undefined : JSON.stringify(data)),
    );

    tool("list_engines", "List the engines that can act, which one is active, and whether it can act right now.",
        z.strictObject({}),
        () => ok({
            active: session.activeEngine.id,
            engines: Object.values(session.engines).map(({ id, name }) => ({ id, name })),
            busy: scheduler.busy,
            muted: scheduler.muted,
            autoAct: scheduler.autoPoker.autoAct,
            pausedOnError: scheduler.errorReason,
        }),
    );

    tool("select_engine", "Make an engine the active one.",
        z.strictObject({ id: z.string().describe("Engine ID from list_engines") }),
        ({ id }) => session.selectEngine(id),
    );

    tool("act", "Ask the active engine to act now. Returns at once; the outcome arrives as 'api/actor/' events, or an 'app/scheduler/act/' event if it couldn't act. Resumes an engine paused on an error.",
        z.strictObject({ force: z.boolean().default(false).describe("The engine must pick an action instead of waiting or speaking") }),
        ({ force }) => session.act(force),
    );

    tool("clear_context", "Clear the actor's context, as if the session just started.",
        z.strictObject({}),
        () => ok(session.clearContext()),
    );

    for (const command of Object.values(COMMANDS) as AgentCommand[]) {
        tool(command.id, command.description, command.input, args => session.run(command, args));
    }

    return server;
}

function matchesKeys(event: EventInstance<EventKey>, keys: string[]) {
    return keys.some(key => event.key.startsWith(key));
}

function toJson(event: EventInstance<EventKey>) {
    const { key, timestamp, data } = redactEvent(event);
    return { key, level: LogLevel[eventLevel(event)].toLowerCase(), timestamp, data };
}
