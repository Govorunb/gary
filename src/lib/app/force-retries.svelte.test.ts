// @vitest-environment svelte-client
import { expect, test, vi } from "vitest";
import { okAsync } from "neverthrow";
import { SelfTestHarness } from "#lib/testing/self-test-harness.js";
import type { Engine } from "./engines/index.svelte";
import type { Session } from "./session.svelte";
import { Scheduler } from "./scheduler.svelte";

test("finishes every force retry when an in-process game rejects immediately", async () => {
    const harness = new SelfTestHarness();
    const disposers: Array<() => void> = [];
    let disposeRoot: (() => void) | undefined;
    try {
        const receive = async () => {
            for await (const text of harness.client.conn.listen()) await harness.client.recvRaw(text);
        };
        void receive();
        await harness.connect();
        await harness.client.hello();
        await harness.client.registerActions([{ name: "move", description: "Move" }]);
        const run = vi.spyOn(harness.client, "runAction").mockResolvedValue({ success: false, message: "Try again" });
        const engine = { id: "test", name: "Test", forceAct: () => okAsync({ name: "move" }) } as unknown as Engine<unknown>;
        const session = Object.assign(harness.session, {
            registry: { games: [harness.server] }, activeEngine: engine,
            onDispose(callback: () => void) { disposers.push(callback); },
        }) as unknown as Session;
        disposeRoot = $effect.root(() => {
            Object.assign(session, { scheduler: new Scheduler(session) });
        });
        await harness.client.sendForce(["move"], "Choose a move");
        await vi.waitFor(() => {
            expect(run).toHaveBeenCalledTimes(4);
            expect(harness.server.hasForce).toBe(false);
            expect(session.scheduler.busy).toBe(false);
        });
    } finally {
        disposers.toReversed().forEach(dispose => dispose());
        disposeRoot?.();
        await harness.dispose();
    }
});
