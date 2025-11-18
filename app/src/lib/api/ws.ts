import { Channel } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import r from "$lib/app/utils/reporting";
import type { NeuroMessage, GameMessage } from "./v1/spec";
import { safeInvoke, type Awaitable } from "$lib/app/utils";
import { err, ok, Ok, type Result } from "neverthrow";

type OnMessageHandler = (msg: string) => Awaitable;
type OnCloseHandler = (clientDisconnected?: CloseFrame) => Awaitable;
type OnConnectHandler = () => Awaitable;
type OnWSErrorHandler = (err: string) => Awaitable;

export abstract class BaseWSConnection {
    #disposed: boolean = false;
    #onmessage: OnMessageHandler[] = [];
    #onclose: OnCloseHandler[] = [];
    #onconnect: OnConnectHandler[] = [];
    #onwserror: OnWSErrorHandler[] = [];

    public get closed() {
        return this.#disposed;
    }

    constructor(
        public readonly id: string,
        public readonly version: string,
    ) {}

    get shortId() {
        return this.id.substring(0, 6);
    }

    public dispose(clientDisconnected?: CloseFrame) {
        this.#disposed = true;
        this.#onconnect.length = 0;
        this.#onmessage.length = 0;
        this.#onwserror.length = 0;
        this.#onclose.forEach(close => close(clientDisconnected));
        this.#onclose.length = 0;
    }

    devAssertNotDisposed() {
        if (this.#disposed) throw new Error(`Connection id '${this.shortId}' is closed`);
    }

    public abstract sendRaw(text: string): Promise<void>;

    public async receiveRaw(text: string) {
        if (this.#disposed) return;
        if (!this.#onmessage.length) {
            r.warn(`Connection ${this.shortId} received a WS message but has no onmessage handler! I have no mouth and I must scream`);
        }
        for (const cbMessage of this.#onmessage) {
            await cbMessage(text);
        }
    }

    protected async connect() {
        if (this.#disposed) return;
        for (const cbConnect of this.#onconnect) {
            await cbConnect();
        }
    }

    protected async error(err: string) {
        if (this.#disposed) return;
        for (const cbError of this.#onwserror) {
            await cbError(err);
        }
    }

    public abstract disconnect(code?: number, reason?: string): Promise<void>;

    protected clientDisconnect(clientDisconnected?: CloseFrame) {
        if (this.#disposed) return;
        r.info(`client ${this.shortId} disconnected`);
        this.dispose(clientDisconnected);
    }

    public send(msg: NeuroMessage): Promise<void> {
        return this.sendRaw(JSON.stringify(msg));
    }

    public receive(msg: GameMessage): Promise<void> {
        return this.receiveRaw(JSON.stringify(msg));
    }

    public onconnect(handler: OnConnectHandler) {
        this.#onconnect.push(handler);
    }

    public onmessage(handler: OnMessageHandler) {
        this.#onmessage.push(handler);
    }

    public onclose(handler: OnCloseHandler) {
        this.#onclose.push(handler);
    }

    public onwserror(handler: OnWSErrorHandler) {
        this.#onwserror.push(handler);
    }
}

export class GameWSConnection extends BaseWSConnection {
    private subscriptions: UnlistenFn[] = [];

    constructor(
        id: string,
        version: string,
        private readonly channel: Channel<ServerWSEvent>,
    ) {
        super(id, version);
        listen<string>('ws-closed', (evt) => {
            if (evt.payload === this.id) this.dispose();
        }).then(unsub => this.subscriptions.push(unsub));
        this.channel.onmessage = (e) => this.processServerEvt(e);
    }

    public override dispose(clientDisconnected?: CloseFrame) {
        this.subscriptions.forEach(unsub => unsub());
        this.subscriptions.length = 0;
        super.dispose(clientDisconnected);
    }

    async processServerEvt(evt: ServerWSEvent) {
        if (this.closed) return;
        switch (evt.type) {
            case "connected":
                await this.connect();
                break;
            case "message":
                await this.receiveRaw(evt.text);
                break;
            case "clientDisconnected":
                this.clientDisconnect(evt);
                break;
            case "wsError":
                // server websocket will close itself
                await this.error(evt.err);
                this.dispose();
                break;
        }
    }

    public async sendRaw(text: string) {
        this.devAssertNotDisposed();
        await safeInvoke('ws_send', { id: this.id, text } satisfies SendArgs)
            .orTee(e => r.error(`Tauri failed to send WS text`, e));
    }

    public async disconnect(code?: number, reason?: string) {
        if (this.closed) return;

        await safeInvoke('ws_close', { id: this.id, code, reason } satisfies CloseArgs)
            .orTee(e => r.error(`Tauri failed to close WS`, e));
        this.dispose();
    }
}

export class InternalWSConnection extends BaseWSConnection {
    protected readonly sendListeners: ((value: Result<string, any>) => void)[] = [];

    constructor(id: string, version: string = "v1") {
        super(id, version);
        setTimeout(() => this.connect(), 10);
    }

    public async sendRaw(text: string) {
        this.devAssertNotDisposed();
        r.verbose(`Internal connection ${this.shortId} sent: ${text}`);
        if (!this.sendListeners.length) {
            r.warn(`${this.shortId} screaming into the void`);
        }
        for (const listener of this.sendListeners) {
            listener(ok(text));
        }
    }

    public async disconnect(code?: number, reason?: string) {
        if (this.closed) return;
        r.verbose(`Internal connection ${this.shortId} disconnecting: ${code} (${reason || 'no reason'})`);
        this.dispose();
    }

    public dispose() {
        for (const listener of this.sendListeners) {
            listener(err(null));
        }
        super.dispose();
    }

    public async* listenSend(): AsyncGenerator<string> {
        while (!this.closed) {
            const res = await new Promise<Result<string, any>>(resolve => this.sendListeners.push(resolve));
            if (res.isErr()) break;
            yield res.value;
        }
    }
}

/** The 'client' side of a connection (as opposed to the regular, server side). */
export class GameWSSender {
    constructor(
        public readonly conn: InternalWSConnection
    ) {}

    public async send(msg: GameMessage) {
        this.conn.receive(msg);
    }

    public async sendRaw(text: string) {
        this.conn.receiveRaw(text);
    }

    public async disconnect(code?: number, reason?: string) {
        this.conn.disconnect(code, reason);
    }

    public listen() {
        return this.conn.listenSend();
    }
}

type CloseFrame = {
    code: number;
    reason?: string;
};

/// channel events

type Connected = {
    type: "connected";
}

type Message = {
    type: "message";
    text: string;
}

type ClientDisconnected = {
    type: "clientDisconnected";
} & CloseFrame;

type ProtocolError = {
    type: "wsError";
    err: string;
}

export type ServerWSEvent = Connected | Message | ClientDisconnected | ProtocolError;

type ConnMsgBase = {id: string}

export type AcceptArgs = ConnMsgBase & {
    channel: Channel<ServerWSEvent>;
}

export type DenyArgs = ConnMsgBase & {
    reason?: string;
}

type SendArgs = ConnMsgBase & {
    text: string;
}

type CloseArgs = ConnMsgBase & Partial<CloseFrame>;
