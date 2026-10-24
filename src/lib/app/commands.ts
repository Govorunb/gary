import z from "zod";
import { ok, type Result } from "neverthrow";
import type { Session } from "./session.svelte";
import type { HotkeyGroup } from "#lib/ui/commands.js";
import { EVENT_BUS } from "./events/bus";
import type { Awaitable } from "./utils";

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

/** Everything the user can do to a session. Each entry is also an MCP tool. */
export const COMMANDS = {
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
