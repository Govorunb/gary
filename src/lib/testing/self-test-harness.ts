import { Game } from "$lib/api/game.svelte";
import { ClientGame, type ActionResult } from "$lib/api/client-game";
import { InternalConnection, InternalConnectionClient } from "$lib/api/connection";
import { zUserPrefs } from "$lib/app/prefs.svelte";
import { ContextManager } from "$lib/app/context.svelte";

class MockSession {
    readonly id = "test-session";
    readonly name = "test-session";
    readonly context: any = new ContextManager(null!);
    readonly scheduler: any = {
        forceQueue: [],
        actPending: false
    };
    readonly userPrefs: any = zUserPrefs.decode({});
    readonly engines: Record<string, any> = {};
    readonly activeEngine: any = null;
}

export class TestClientGame extends ClientGame {
    constructor(conn: InternalConnectionClient, gameName: string = "test-game") {
        super(gameName, conn);
    }

    public async runAction(name: string, _data: any): Promise<ActionResult> {
        return { success: true, message: `Executed ${name}` };
    }
}

export class SelfTestHarness {
    public client: TestClientGame;
    public server: Game;
    public readonly session: MockSession;
    
    constructor(gameName: string = "test-game", version = "v1") {
        this.session = new MockSession();
        
        const svConn = new InternalConnection(`${gameName}-conn`, version);
        const clConn = new InternalConnectionClient(svConn);
        
        this.server = new Game(this.session as any, svConn);
        this.client = new TestClientGame(clConn, gameName);
    }

    public async connect() {
        await (this.server.conn as InternalConnection).connect();
    }
    public async disconnect() {
        await this.server.conn.disconnect();
    }

    public get diagnostics() {
        return this.server.diagnostics.diagnostics;
    }

    public get actions() {
        return this.server.actions;
    }

    public get status() {
        return this.server.status;
    }
}
