import { InternalConnection, ConnectionClient } from "$lib/api/connection";
import { DiagnosticsExampleGame } from "$lib/app/diagnostics-example";
import { SchemaTestGame } from "$lib/app/schema-test";
import type { Registry } from "$lib/api/registry.svelte";
import { tick } from "svelte";

export async function startSchemaTest(registry: Registry) {
    // timestamp reversed to make spotting differences easier (seconds at the start vs middle)
    const conn = new InternalConnection(`${Date.now().toString().reverse()}-schema-test`, "v1");
    const schemaTestGame = new SchemaTestGame(new ConnectionClient(conn));

    registry.createGame(conn);
    await tick();
    await conn.connect();
    await schemaTestGame.lifecycle();
}

export async function startDiagnosticsExample(registry: Registry) {
    const conn = new InternalConnection(`${Date.now().toString().reverse()}-diagnostics-example`, "v1");
    const diagnosticsExampleGame = new DiagnosticsExampleGame(new ConnectionClient(conn));

    registry.createGame(conn);
    await tick();
    await conn.connect();
    await diagnosticsExampleGame.lifecycle();
}
