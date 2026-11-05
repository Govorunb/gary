// @vitest-environment svelte-client
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ok } from "neverthrow";
import { tick } from "svelte";
import * as v1 from "#lib/api/v1/spec.js";
import { ConnectionClient, InternalConnection } from "#lib/api/connection.js";
import { TestClientGame } from "#lib/testing/self-test-harness.js";
import { EVENT_BUS } from "./events/bus";
import { UserPrefs, zUserPrefs } from "./prefs.svelte";
import { Session, SESSION_KEYS } from "./session.svelte";
import { COMMANDS } from "./commands";
import { EVENTS_BY_KEY, type EventDef } from "./events";
import z from "zod";
import { parseJson, sessionJson, zSessionFile } from "./session-file";
import { MAX_DISPLAYED_EVENTS } from "./events/log.svelte";

let live: Session;
let cleanup: () => void;
beforeEach(async () => {
    vi.stubGlobal("localStorage", { setItem: vi.fn() });
    cleanup = $effect.root(() => { live = new Session("live", new UserPrefs(ok(zUserPrefs.decode({ version: "test" })))); });
    await tick();
});
afterEach(() => { live.dispose(); cleanup(); vi.unstubAllGlobals(); });

async function connectGame(id: string, name: string) {
    const conn = new InternalConnection(id, "v1");
    const client = new TestClientGame(new ConnectionClient(conn), name);
    live.registry.createGame(conn);
    await conn.connect();
    void (async () => {
        for await (const msg of client.conn.listen()) await client.recvRaw(msg);
    })();
    await client.hello();
    return client;
}

/** Everything a session shows that should survive a save and load. */
async function state(session: Session) {
    await session.context.whenDisplayed();
    return {
        user: session.context.userView.map(event => event.id),
        actor: session.context.actorView.map(event => event.id),
        games: session.registry.games.map(game => ({
            id: game.id, name: game.name, version: game.version, status: game.status,
            actions: [...game.actions.values()].map(action => ({ ...action })),
            diagnostics: game.diagnostics.diagnostics.map(diag => ({ ...diag })),
        })),
    };
}

async function playSession() {
    const chess = await connectGame("chess-conn", "Chess");
    await chess.registerActions([
        v1.zAction.decode({ name: "move", description: "Move a piece", schema: { type: "object", properties: { to: { type: "string" } } } }),
        v1.zAction.decode({ name: "resign" }), // no description: a diagnostic
    ]);
    // v1 keeps the first of two conflicting definitions, in one message or across messages
    await chess.registerActions([v1.zAction.decode({ name: "move", description: "Changed" }), v1.zAction.decode({ name: "draw", description: "Offer" }), v1.zAction.decode({ name: "draw", description: "Other" })]);
    await chess.unregisterActions(["resign", "resign", "unknown"]);
    await chess.sendContext("White to move");
    await chess.sendForce(["move"], "Your move");
    const game = live.registry.games[0];
    game.diagnostics.dismiss("prot/action/no_desc");
    const pub = await connectGame("pub-conn", "Pub");
    await pub.registerActions([v1.zAction.decode({ name: "pour", description: "Pour a drink" })]);
    EVENT_BUS.emit("ui/context/input", { text: "Be nice", silent: true });
    live.run(COMMANDS.act, { force: true });
    await vi.waitFor(() => expect(live.scheduler.busy).toBe(false));
    await tick();
}

test("loading a saved session rebuilds its context, games and diagnostics without acting", async () => {
    await playSession();
    const parsed = parseJson(zSessionFile, sessionJson(live.toFile(), []));
    if (parsed.isErr()) throw new Error(parsed.error);
    const saved = parsed.value;

    const global = vi.fn();
    const sub = EVENT_BUS.subscribe();
    sub.onnext(global);
    const loaded = new Session("loaded", live.userPrefs, { events: saved.events });
    const prompt = vi.spyOn(loaded.scheduler, "requestAct");
    try {
        const expected = await state(live);
        expect(expected.games).toHaveLength(2);
        expect(expected.games[0].diagnostics.length).toBeGreaterThan(2);
        expect(await state(loaded)).toEqual(expected);
        // the history starts with the session's creation, and copies keep its ID
        expect(live.history()[0]).toMatchObject({ key: "app/session/created", data: { session: { id: live.id } } });
        expect(loaded.id).toBe(live.id);
        expect(loaded.registry.games.every(game => game.conn.closed)).toBe(true);
        expect(global).not.toHaveBeenCalled();

        // the record keeps its own log: commands on it don't reach the live session
        const liveCursor = live.eventLog.cursor;
        loaded.run(COMMANDS.clearContext, {});
        loaded.registry.games[0].diagnostics.reset();
        expect(loaded.context.actorView).toHaveLength(0);
        expect(loaded.registry.games[0].diagnostics.diagnostics).toHaveLength(0);
        expect(live.eventLog.cursor).toBe(liveCursor);
        expect(live.context.actorView.length).toBeGreaterThan(0);
        expect(loaded.run(COMMANDS.sendAction, { game: loaded.registry.games[0].id, action: "move" })).toEqual(expect.objectContaining({ error: "Chess is disconnected" }));
        expect(prompt).not.toHaveBeenCalled();
        const engine = vi.spyOn(loaded.activeEngine, "tryAct");
        loaded.run(COMMANDS.act, { force: false });
        await tick();
        expect(engine).not.toHaveBeenCalled();
    } finally {
        sub.destroy();
        loaded.dispose();
    }
});

test("forking at an event keeps the session as it was then", async () => {
    await playSession();
    const forkAt = live.eventLog.history().find(event => event.key === "api/game/unregister")!;
    const fork = live.fork(forkAt.id)._unsafeUnwrap();
    try {
        const chess = fork.registry.games[0];
        expect(fork.registry.games.map(game => game.name)).toEqual(["Chess"]);
        expect(chess.getAction("resign")).toBeUndefined();
        expect(chess.getAction("resign", false)).toBeDefined();
        expect(fork.context.actorView.map(event => event.key)).toEqual(["api/game/connected"]);
        expect(fork.id).toBe(live.id);
        expect(live.fork(live.history()[0].id)._unsafeUnwrap().history()).toHaveLength(1);
        expect(live.fork("not an event").isErr()).toBe(true);
    } finally {
        fork.dispose();
    }
});

test("keeps raw provider responses after they leave the event log's window, and saves them once without credentials", () => {
    live.userPrefs.engines.openRouter.apiKey = "sk-or-test-key";
    const response = { value: { id: "completion", usage: { total_tokens: 3 } } };
    EVENT_BUS.emit("app/engines/llm/response", { reqId: "r1", response });
    // providers quote the key they were sent
    EVENT_BUS.emit("app/engines/llm/response", { reqId: "r2", response: { error: { message: "Invalid API key: sk-or-test-key" } } });
    for (let i = 0; i < MAX_DISPLAYED_EVENTS; i++) EVENT_BUS.emit("app/prefs/save/success");
    expect(live.eventLog.since(0).some(event => event.key === "app/engines/llm/response")).toBe(false);
    const text = sessionJson(live.toFile(), live.userPrefs.secrets);
    expect(text).not.toContain("sk-or-test-key");
    const saved = parseJson(zSessionFile, text)._unsafeUnwrap();
    expect(saved.events.filter(event => event.key === "app/engines/llm/response")).toMatchObject([
        { data: { reqId: "r1", response } },
        { data: { reqId: "r2", response: { error: { message: "Invalid API key: [REDACTED]" } } } },
    ]);
});

test("every event a session is rebuilt from has a payload schema to check saved files against", () => {
    for (const key of SESSION_KEYS) {
        const schema = (EVENTS_BY_KEY[key] as EventDef).dataSchema;
        expect(schema === undefined || schema instanceof z.ZodType, key).toBe(true);
    }
});
