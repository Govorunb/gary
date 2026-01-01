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
    #onmessage: OnMessageHandler[] = [];
    #onclose: OnCloseHandler[] = [];
    #onconnect: OnConnectHandler[] = [];
    #onerror: OnErrorHandler[] = [];

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
        this.#onerror.length = 0;
        this.#onclose.forEach(close => close(clientDisconnected));
        this.#onclose.length = 0;
    }

    devAssertNotDisposed() {
        if (!this.#disposed) return;
        r.fatal(`Connection id '${this.shortId}' is closed`);
    }

    public abstract sendRaw(text: string): Promise<void>;

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

    // TODO: onconnect should instantly fire if already connected
    public onconnect(handler: OnConnectHandler) {
        this.#onconnect.push(handler);
    }

    public onmessage(handler: OnMessageHandler) {
        this.#onmessage.push(handler);
    }

    public onclose(handler: OnCloseHandler) {
        this.#onclose.push(handler);
    }

    public onwserror(handler: OnErrorHandler) {
        this.#onerror.push(handler);
    }
    
    public async* listen(): AsyncGenerator<string> {
        type T = string | null;
        // type Resolve = Parameters<ConstructorParameters<typeof Promise<T>>[0]>[0];
        type Resolve = (value: T) => void;
        
        const state = {resolve: null as Resolve | null};
        
        this.onmessage((text) => state.resolve?.(text));
        this.onclose(() => state.resolve?.(null));
        
        while (!this.closed) {
            const res = await new Promise<T>(resolve => void (state.resolve = resolve));
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

    protected clientDisconnect(clientDisconnected?: CloseFrame) {
        if (this.closed) return;
        r.info(`client ${this.shortId} disconnected`);
        this.dispose(clientDisconnected);
    }
}

export class InternalConnection extends BaseConnection {
    protected readonly sendListeners: ((value: string | null) => void)[] = [];

    constructor(id: string, version: string = "v1") {
        super(id, version);
    }

    public override connect() {
        return super.connect();
    }

    public async sendRaw(text: string) {
        this.devAssertNotDisposed();
        r.verbose(`Internal connection ${this.shortId} sent: ${text}`);
        if (!this.sendListeners.length) {
            r.error(`${this.shortId} screaming into the void`);
        }
        for (const listener of this.sendListeners) {
            listener(text);
        }
    }

    public async disconnect(code?: number, reason?: string) {
        if (this.closed) return;
        r.verbose(`Internal connection ${this.shortId} disconnecting: ${code} (${reason || 'no reason'})`);
        this.dispose();
    }

    public dispose() {
        for (const listener of this.sendListeners) {
            listener(null);
        }
        super.dispose();
    }

    public async* listenSend(): AsyncGenerator<string> {
        while (!this.closed) {
            const res = await new Promise<string | null>(resolve => this.sendListeners.push(resolve));
            if (res === null) break;
            yield res;
        }
    }
}

/** The 'client' side of a connection (as opposed to the regular, server side).
 * Inverts sender and receiver.
*/
export class InternalConnectionClient {
    constructor(
        public readonly conn: InternalConnection
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
