import { afterEach, beforeEach, expect, test } from "vitest";
import { ok } from "neverthrow";
import * as v1 from "#lib/api/v1/spec.js";
import { ConnectionClient, InternalConnection } from "#lib/api/connection.js";
import { TestClientGame } from "#lib/testing/self-test-harness.js";
import { EVENT_BUS } from "./events/bus";
import { UserPrefs, zUserPrefs } from "./prefs.svelte";
import { Session } from "./session.svelte";
import { handleMcpRequest } from "./mcp";

let session: Session;
let nextId = 0;

beforeEach(() => {
    session = new Session("test", new UserPrefs(ok(zUserPrefs.decode({ version: "test" }))));
});
afterEach(() => session.dispose());

function post(message: object) {
    return handleMcpRequest(session, {
        headers: [
            ["content-type", "application/json"],
            ["accept", "application/json, text/event-stream"],
            ["mcp-protocol-version", "2025-11-25"],
        ],
        body: JSON.stringify({ jsonrpc: "2.0", ...message }),
    });
}

async function rpc(method: string, params?: object) {
    const res = await post({ id: nextId++, method, params });
    return JSON.parse(res.body);
}

async function call(name: string, args: object = {}) {
    const { result } = await rpc("tools/call", { name, arguments: args });
    return result.isError ? result : JSON.parse(result.content[0].text);
}

async function connectGame(id = "test-conn") {
    const conn = new InternalConnection(id, "v1");
    const client = new TestClientGame(new ConnectionClient(conn));
    session.registry.createGame(conn);
    await conn.connect();
    void (async () => {
        for await (const msg of client.conn.listen()) await client.recvRaw(msg);
    })();
    await client.hello();
    await client.registerActions([v1.zAction.decode({
        name: "jump",
        description: "Jump",
        schema: { type: "object", properties: { height: { type: "number" } } },
    })]);
    return client;
}

test("speaks MCP over plain JSON", async () => {
    const init = await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
    });
    expect(init.result.protocolVersion).toBe("2025-06-18");

    const notification = await post({ method: "notifications/initialized" });
    expect(notification.status).toBe(202);

    const { result: { tools } } = await rpc("tools/list");
    const wait = tools.find((t: { name: string }) => t.name === "wait_for_events");
    expect(wait.inputSchema.required).toEqual(["keys"]);

    const invalid = await call("wait_for_events", {});
    expect(invalid.isError).toBe(true);
});

test("sends an action as the user and waits for the game's result", async () => {
    const client = await connectGame();
    const { games: [game] } = await call("list_games");
    expect(game).toMatchObject({ name: client.name, actions: [{ name: "jump", active: true }] });

    const sent = await call("send_action", { game: game.id, action: "jump", data: { height: 2 } });
    // the result may already be in by the time the agent waits
    await new Promise(resolve => setTimeout(resolve));
    const waited = await call("wait_for_events", { after: sent.cursor, keys: ["api/game/action_result"] });
    expect(waited.matched).toMatchObject({ data: { success: true, act: { name: "jump", data: '{"height":2}' } } });
    expect(waited.events.map((e: { key: string }) => e.key)).toContain("ui/game/user_act/send");

    const later = call("wait_for_events", { after: waited.cursor, keys: ["api/game/context"] });
    await client.sendContext("Landed");
    expect((await later).matched).toMatchObject({ data: { message: "Landed" } });
});

test("only sends to a game ID that matches exactly one game", async () => {
    await connectGame("game-a");
    await connectGame("game-b");
    for (const game of ["", "game-"]) {
        expect(await call("send_action", { game, action: "jump" })).toMatchObject({ isError: true });
    }
    expect(await call("send_action", { game: "game-b", action: "jump" })).not.toHaveProperty("isError");
});

test("gives up waiting after the timeout", async () => {
    expect(await call("wait_for_events", { keys: ["nothing/"], timeoutMs: 1 })).toMatchObject({ matched: null });
});

test("rejects a cursor from before a restart", async () => {
    const after = session.eventLog.cursor + 1;
    for (const tool of ["read_events", "wait_for_events"]) {
        expect(await call(tool, { after, keys: ["api/"] })).toMatchObject({ isError: true });
    }
});

test("keeps secrets out of what agents read", async () => {
    const apiKey = "sk-local-0123456789";
    session.userPrefs.engines.lmstudio.apiKey = apiKey;
    EVENT_BUS.emit("app/engines/llm/request", { reqId: "1", params: { messages: [] } });
    EVENT_BUS.emit("ui/context/input", { text: `my key is ${apiKey}`, silent: true });

    const { events } = await call("read_events", { keys: ["app/engines/llm/request", "ui/context/input"], minLevel: "verbose" });
    expect(events).toMatchObject([
        { data: { reqId: "1", params: "[REDACTED_OBJECT]" } },
        { data: { text: "my key is [REDACTED]" } },
    ]);

    // replaced while a call is running
    const waiting = call("wait_for_events", { keys: ["ui/context/input"], timeoutMs: 1000 });
    await new Promise(resolve => setTimeout(resolve, 10));
    session.userPrefs.engines.lmstudio.apiKey = "sk-local-9876543210";
    EVENT_BUS.emit("ui/context/input", { text: `old key ${apiKey}`, silent: true });
    expect((await waiting).matched).toMatchObject({ data: { text: "old key [REDACTED]" } });
});
