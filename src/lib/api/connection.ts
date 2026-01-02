import type { Channel } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import r from "$lib/app/utils/reporting";
import type { NeuroMessage, GameMessage } from "./v1/spec";
import { listenSub, safeInvoke, type Awaitable } from "$lib/app/utils";

type OnMessageHandler = (msg: string) => Awaitable;
type OnCloseHandler = (clientDisconnected?: CloseFrame) => Awaitable;
type OnConnectHandler = () => Awaitable;
type OnErrorHandler = (err: string) => Awaitable;

export abstract class BaseConnection {
    #disposed: boolean = false;
    #onerror: OnErrorHandler[] = [];
    #onconnect: OnConnectHandler[] = [];
    #onmessage: OnMessageHandler[] = [];
    #onsend: OnMessageHandler[] = [];
    #onclose: OnCloseHandler[] = [];

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
        this.#onerror.length = 0;
        this.#onconnect.length = 0;
        this.#onmessage.length = 0;
        this.#onsend.length = 0;
        this.#onclose.forEach(close => close(clientDisconnected));
        this.#onclose.length = 0;
    }

    devAssertNotDisposed() {
        if (!this.#disposed) return;
        r.fatal(`Connection id '${this.shortId}' is closed`);
    }

    protected abstract protocolSend(text: string): Promise<void>;

    public async sendRaw(text: string) {
        if (this.#disposed) return;
        void this.protocolSend(text);
        for (const cbSend of this.#onsend) {
            await cbSend(text);
        }
    }

    public async receiveRaw(text: string) {
        if (this.#disposed) return;
        if (!this.#onmessage.length) {
            r.warn(`Connection ${this.shortId} has no onmessage handlers!`, `Text: ${text}`);
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
        for (const cbError of this.#onerror) {
            await cbError(err);
        }
    }

    public abstract disconnect(): Promise<void>;

    public send(msg: NeuroMessage): Promise<void> {
        return this.sendRaw(JSON.stringify(msg));
    }

    public receive(msg: GameMessage): Promise<void> {
        return this.receiveRaw(JSON.stringify(msg));
    }

    public onerror(handler: OnErrorHandler) {
        this.#onerror.push(handler);
    }
    // TODO: onconnect should instantly fire if already connected
    public onconnect(handler: OnConnectHandler) {
        this.#onconnect.push(handler);
    }

    public onmessage(handler: OnMessageHandler) {
        this.#onmessage.push(handler);
    }

    public onsend(handler: OnMessageHandler) {
        this.#onsend.push(handler);
    }

    public onclose(handler: OnCloseHandler) {
        this.#onclose.push(handler);
    }

    public async* listen(): AsyncGenerator<string> {
        type T = string | null;
        type Resolve = (value: T) => void;

        const queue: T[] = [];
        let resolve: Resolve | null = null;

        const tryResolve = () => {
            if (!resolve) return;
            const value = queue.shift();
            if (!value) return;
            
            // reentry
            const next = resolve;
            resolve = null;
            next(value);
        };

        this.onmessage(text => { queue.push(text); tryResolve(); });
        this.onclose(() => { queue.push(null); tryResolve(); });

        tryResolve();

        while (!this.closed) {
            if (queue.length) {
                const value = queue.shift()!;
                if (value === null) break;
                yield value;
                tryResolve();
                continue;
            }
            const res = await new Promise<T>(r => resolve = r);
            tryResolve();
            if (res === null) break;
            yield res;
        }
    }

    public async* listenSend(): AsyncGenerator<string> {
        type T = string | null;
        type Resolve = (value: T) => void;

        const queue: T[] = [];
        let resolve: Resolve | null = null;

        const tryResolve = () => {
            if (!resolve) return;
            const value = queue.shift();
            if (!value) return;
            
            // reentry
            const next = resolve;
            resolve = null;
            next(value);
        };

        this.onsend(text => { queue.push(text); tryResolve(); });
        this.onclose(() => { queue.push(null); tryResolve(); });

        tryResolve();

        while (!this.closed) {
            if (queue.length) {
                const value = queue.shift()!;
                if (value === null) break;
                yield value;
                tryResolve();
                continue;
            }
            const res = await new Promise<T>(r => resolve = r);
            tryResolve();
            if (res === null) break;
            yield res;
        }
    }
}

export class TauriServerConnection extends BaseConnection {
    private subscriptions: UnlistenFn[] = [];

    constructor(
        id: string,
        version: string,
        private readonly channel: Channel<ServerWSEvent>,
    ) {
        super(id, version);
        listenSub<string>('ws-closed', (evt) => evt.payload === this.id && this.dispose(), this.subscriptions);
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

    protected async protocolSend(text: string) {
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

    protected clientDisconnect(clientDisconnected?: CloseFrame) {
        if (this.closed) return;
        r.info(`client ${this.shortId} disconnected`);
        this.dispose(clientDisconnected);
    }
}

export class InternalConnection extends BaseConnection {
    constructor(id: string, version: string = "v1") {
        super(id, version);
    }

    public override connect() {
        return super.connect();
    }

    protected async protocolSend(text: string) {
        this.devAssertNotDisposed();
        r.verbose(`Internal connection ${this.shortId} sent: ${text} (should be listening with onsend)`);
    }

    public async disconnect() {
        if (this.closed) return;
        r.verbose(`Internal connection ${this.shortId} disconnecting`);
        this.dispose();
    }
}

/** The 'client' side of a connection (as opposed to the regular, server side).
 * Inverts sender and receiver.
*/
export class ConnectionClient {
    constructor(
        public readonly conn: BaseConnection
    ) {}

    public async send(msg: GameMessage) {
        this.conn.receive(msg);
    }

    public async sendRaw(text: string) {
        this.conn.receiveRaw(text);
    }

    public async disconnect() {
        this.conn.disconnect();
    }

    public listen() {
        return this.conn.listenSend();
    }
    public listenSend() {
        return this.conn.listen();
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
