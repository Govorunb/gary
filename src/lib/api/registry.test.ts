import { describe, expect, test } from "vitest";
import { BaseConnection } from "./connection";
import {
    sendDeprecatedV1ReregisterAllForCompat,
    shouldSendDeprecatedV1ReregisterAll,
} from "./registry.svelte";
import { EVENT_BUS } from "$lib/app/events/bus";
import { zApiPrefs, type ApiPrefs } from "$lib/app/prefs.svelte";

class TestConnection extends BaseConnection {
    sent: string[] = [];

    protected async protocolSend(text: string) {
        this.sent.push(text);
    }

    public async disconnect() {
        this.dispose();
    }
}

function apiPrefs(sendV1ReregisterAll: boolean): ApiPrefs {
    return zApiPrefs.decode({
        compatibility: { sendV1ReregisterAll },
    });
}

describe("v1 re-register compatibility", () => {
    test("does not send or emit when disabled", async () => {
        const conn = new TestConnection("v1-disabled", "v1");
        const events: unknown[] = [];
        const sub = EVENT_BUS.subscribe(["api/registry/v1/reregister_all"]);
        sub.onnext(event => events.push(event));

        try {
            const sent = await sendDeprecatedV1ReregisterAllForCompat(conn, apiPrefs(false));

            expect(sent).toBe(false);
            expect(conn.sent).toStrictEqual([]);
            expect(events).toStrictEqual([]);
        } finally {
            sub.destroy();
        }
    });

    test("emits and sends reregister_all when enabled for v1", async () => {
        const conn = new TestConnection("v1-enabled", "v1");
        const events: unknown[] = [];
        const sub = EVENT_BUS.subscribe(["api/registry/v1/reregister_all"]);
        sub.onnext(event => events.push(event));

        try {
            const sent = await sendDeprecatedV1ReregisterAllForCompat(conn, apiPrefs(true));

            expect(sent).toBe(true);
            expect(conn.sent).toStrictEqual([JSON.stringify({ command: "actions/reregister_all" })]);
            expect(events).toHaveLength(1);
        } finally {
            sub.destroy();
        }
    });

    test("does not send to non-v1 clients even when enabled", () => {
        expect(shouldSendDeprecatedV1ReregisterAll("v2", apiPrefs(true))).toBe(false);
    });
});
