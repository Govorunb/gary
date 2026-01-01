import { Game } from "$lib/api/game.svelte";
import { ClientGame, type ActionResult } from "$lib/api/client-game";
import { InternalConnection, ConnectionClient } from "$lib/api/connection";
import { type UserPrefs, zGamePrefs, zUserPrefs } from "$lib/app/prefs.svelte";
import { ContextManager } from "$lib/app/context.svelte";
import type { Scheduler } from "$lib/app/scheduler.svelte";
import type * as v1 from "$lib/api/v1/spec";


function mock<T, U extends Partial<T>>(mock: U): U & { [K in Exclude<keyof T, keyof U>]: never } {
    return mock as any;
}

class MockSession {
    private readonly mockScheduler = {
        forceQueue: [] as Array<v1.Action[] | null>,
        actPending: false
    };
    private readonly mockPrefs = {
        ...zUserPrefs.decode({}),
        getGamePrefs(game: string) {
            return this.api.games[game] ??= zGamePrefs.decode({});
        }
    };
    readonly id = "test-session";
    readonly name = "test-session";
    readonly context = new ContextManager();
    readonly scheduler = mock<Scheduler, typeof this.mockScheduler>(this.mockScheduler);
    readonly userPrefs = mock<UserPrefs, typeof this.mockPrefs>(this.mockPrefs);
    readonly engines: Record<string, any> = {};
    readonly activeEngine: any = null;
}

export class TestClientGame extends ClientGame {
    constructor(conn: ConnectionClient, gameName: string = "test-game") {
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
        const clConn = new ConnectionClient(svConn);
        
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
    public get diagnosticIds() {
        return this.server.diagnostics.diagnostics.map(d => (d.dismissed ? "!" : "") + d.id);
    }

    public get actions() {
        return this.server.actions;
    }

    public get status() {
        return this.server.diagnostics.status;
    }
}
