import { expect, test } from "vitest";

// The app loads the server manager before the events index; a cycle through mcp.ts used to hit a TDZ here.
test("server manager loads before the events index", async () => {
    const { EVENTS } = await import("./server-manager.svelte");
    const { EVENTS_BY_KEY } = await import("./events");
    expect(EVENTS_BY_KEY[EVENTS[0].key]).toBeDefined();
}, 30_000); // cold-loads most of the app
