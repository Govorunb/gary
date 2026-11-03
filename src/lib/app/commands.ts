import z from "zod";
import { err, ok, ResultAsync, type Result } from "neverthrow";
import type { Session } from "./session.svelte";
import type { HotkeyGroup } from "#lib/ui/commands.js";
import { EVENT_BUS } from "./events/bus";
import { parseError, type Awaitable } from "./utils";

/** Keys held together, named as in `KeyboardEvent.key`, e.g. `["Control", "Enter"]`. */
export type Chord = string[];

/** Something the user can do. Buttons, menus, hotkeys and the hotkeys dialog all go through its definition. */
export type Command<I = void> = {
    /** What it does, in the app's terms. The hotkeys dialog and tooltips show it next to its keys; button labels stay in their components. */
    title: string;
    /** The hotkeys dialog section listing its keys. */
    group?: HotkeyGroup;
    keys?: Chord[];
    /** Why it can't run right now, if it can't. Checked by `Session.run` before `run`. */
    unavailable?(session: Session): string | undefined;
    // biome-ignore lint/suspicious/noConfusingVoidType: commands with nothing to report return Result<void>
    run(session: Session, input: I): Awaitable<Result<object | void, string>>;
};

/** A command an agent can run too. Each one is an MCP tool named by its `id`. */
export type AgentCommand<S extends z.ZodType = z.ZodType> = Command<z.output<S>> & {
    id: string;
    /** For agents: what it does and what to expect after. */
    description: string;
    input: S;
};

export const command = <S extends z.ZodType>(definition: AgentCommand<S>) => definition;

/** Whether the command can run right now, e.g. for a button's disabled state. */
export const canRun = (session: Session, command: Command<never>) => !command.unavailable?.(session);

export const zGameId = z.string().describe("Game ID from list_games (a unique prefix is enough)");

const whenIdle = (session: Session) => session.scheduler.busy ? "The engine is busy acting" : undefined;

/** Everything the user can do to a session. Each entry is also an MCP tool. */
export const COMMANDS = {
    sendAction: command({
        id: "send_action",
        title: "Send",
        description: "Send an action to a game as the user, bypassing the engine. The game's result arrives later as an 'api/game/action_result' event.",
        input: z.strictObject({
            game: zGameId,
            action: z.string(),
            data: z.unknown().optional().describe("Action data matching the action's schema; omit for actions without one"),
            rawData: z.string().optional().describe("Instead of data: the exact text to send as the action's data, even if it isn't valid JSON"),
        }).refine(({ data, rawData }) => data === undefined || rawData === undefined, "Pass data or rawData, not both"),
        unavailable: whenIdle,
        run: (session, { game: gameId, action: actionName, data, rawData = data === undefined ? undefined : JSON.stringify(data) }) => {
            const game = session.registry.getGame(gameId);
            if (!game) return err(`'${gameId}' doesn't match exactly one game ID`);
            if (!game.getAction(actionName, false)) return err(`${game.name} has no action '${actionName}'`);
            const evtData = { gameId: game.id, actionName };
            EVENT_BUS.emit('ui/game/user_act/send', { ...evtData, hasData: !!rawData });
            game.manualSend(actionName, rawData)
                .catch(e => EVENT_BUS.emit('ui/game/user_act/send_error', { ...evtData, error: parseError(e) }));
            return ok();
        },
    }),
    act: command({
        id: "act",
        title: "Act",
        description: "Ask the active engine to act now. Returns at once; the outcome arrives as 'api/actor/' events, or an 'app/scheduler/act/' event if it couldn't act. Resumes an engine paused on an error.",
        input: z.strictObject({ force: z.boolean().default(false).describe("The engine must pick an action instead of waiting or speaking") }),
        unavailable: whenIdle,
        run: ({ scheduler }, { force }) => {
            scheduler.clearError();
            void (force ? scheduler.forceAct() : scheduler.tryAct());
            return ok();
        },
    }),
    stopAct: command({
        id: "stop_act",
        title: "Stop the current act",
        description: "Stop the engine's current act, as if it chose not to act. Confirmed by an 'app/scheduler/act/cancelled' event.",
        input: z.strictObject({}),
        unavailable: ({ scheduler }) => scheduler.busy ? undefined : "The engine isn't acting",
        run: ({ scheduler }) => scheduler.cancelAct() ? ok() : err("The engine's act is already being carried out"),
    }),
    setPaused: command({
        id: "set_paused",
        title: "Pause",
        description: "Pause or unpause the engine. A paused engine doesn't act, even when asked to. Either way, this clears a pause caused by an engine error.",
        input: z.strictObject({ paused: z.boolean() }),
        run: ({ scheduler }, { paused }) => {
            if (scheduler.muted !== paused) scheduler.toggleMuted();
            scheduler.clearError();
            return ok();
        },
    }),
    setAutoAct: command({
        id: "set_auto_act",
        title: "Auto-act",
        description: "Turn auto-act on or off. While it's on, the engine is prompted to act after a few idle seconds, and forced to after a longer idle stretch. The user sets both intervals.",
        input: z.strictObject({ enabled: z.boolean() }),
        run: ({ scheduler }, { enabled }) => {
            scheduler.autoPoker.autoAct = enabled;
            return ok();
        },
    }),
    selectEngine: command({
        id: "select_engine",
        title: "Select engine",
        description: "Make an engine the active one.",
        input: z.strictObject({ id: z.string().describe("Engine ID from list_engines") }),
        run: (session, { id }) => {
            if (!Object.hasOwn(session.engines, id)) return err(`No engine with ID '${id}'`);
            session.userPrefs.app.selectedEngine = id;
            return ok();
        },
    }),
    sendRawMessage: command({
        id: "send_raw_message",
        title: "Send",
        description: "Send any text to a game over its connection, unchecked. Use it to test how a game handles messages that break the protocol, e.g. '{\"command\": \"actions/reregister_all\"}'.",
        input: z.strictObject({ game: zGameId, message: z.string().describe("The exact text to send") }),
        run: async (session, { game: gameId, message }) => {
            const game = session.registry.getGame(gameId);
            if (!game) return err(`'${gameId}' doesn't match exactly one game ID`);
            const sent = await ResultAsync.fromPromise(game.conn.sendRaw(message), parseError);
            if (sent.isErr()) {
                EVENT_BUS.emit('ui/game/send_raw/error', { gameId: game.id, gameName: game.name, error: sent.error });
                return err(sent.error.message);
            }
            EVENT_BUS.emit('ui/game/send_raw/sent', { gameId: game.id });
            return ok();
        },
    }),
    disconnectGame: command({
        id: "disconnect_game",
        title: "Disconnect",
        description: "Close a game's connection. The game is removed with an 'api/registry/game_removed' event.",
        input: z.strictObject({ game: zGameId }),
        run: (session, { game: gameId }) => {
            const game = session.registry.getGame(gameId);
            if (!game) return err(`'${gameId}' doesn't match exactly one game ID`);
            void game.conn.disconnect();
            return ok();
        },
    }),
    clearContext: command({
        id: "clear_context",
        title: "Reset Context",
        description: "Clear the actor's context, as if the session just started.",
        input: z.strictObject({}),
        run: () => {
            EVENT_BUS.emit('ui/context/reset');
            return ok();
        },
    }),
    addContext: command({
        id: "add_context",
        title: "Send",
        group: "Add to context",
        keys: [["Control", "Enter"]],
        description: "Add a message to the actor's context as the user. Unless it's silent, the engine is prompted to act; its response arrives as 'api/actor/' events.",
        input: z.strictObject({
            text: z.string().min(1),
            silent: z.boolean().default(false).describe("Add it without prompting the engine to act"),
        }),
        run: (_session, { text, silent }) => {
            EVENT_BUS.emit('ui/context/input', { text, silent });
            return ok();
        },
    }),
};
