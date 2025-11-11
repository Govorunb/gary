import { Channel } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as log from "@tauri-apps/plugin-log";
import type { NeuroMessage } from "./v1/spec";
import { safeInvoke } from "$lib/app/utils.svelte";

type OnMessageHandler = (msg: string) => any;
type OnCloseHandler = (clientDisconnected?: CloseFrame) => void;
type OnConnectHandler = () => Promise<void>;
type OnWSErrorHandler = (err: string) => Promise<void>;

export abstract class BaseWSConnection {
    #disposed: boolean = false;
    public onmessage?: OnMessageHandler;
    public onclose?: OnCloseHandler;
    public onconnect?: OnConnectHandler;
    public onwserror?: OnWSErrorHandler;

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
        this.onconnect = undefined;
        this.onmessage = undefined;
        this.onwserror = undefined;
        this.onclose?.(clientDisconnected);
        this.onclose = undefined;
    }

    devAssertNotDisposed() {
        if (this.#disposed) throw new Error(`Connection id '${this.shortId}' is closed`);
    }

    protected async message(text: string) {
        if (this.#disposed) return;
        if (this.onmessage) {
            await this.onmessage(text);
        } else {
            log.warn(`Connection ${this.shortId} received a WS message but has no onmessage handler! I have no mouth and I must scream`);
        }
    }

    protected async connect() {
        if (this.#disposed) return;
        await this.onconnect?.();
    }

    protected async error(err: string) {
        if (this.#disposed) return;
        await this.onwserror?.(err);
    }

    protected clientDisconnect(clientDisconnected?: CloseFrame) {
        if (this.#disposed) return;
        log.info(`client ${this.shortId} disconnected`);
        this.dispose(clientDisconnected);
    }

    public send(msg: NeuroMessage): Promise<void> {
        return this.sendRaw(JSON.stringify(msg));
    }

    public abstract sendRaw(text: string): Promise<void>;
    public abstract disconnect(code?: number, reason?: string): Promise<void>;
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
                await this.message(evt.text);
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
            .orTee(e => log.error(`Failed to send WS text: ${e}`));
    }

    public async disconnect(code?: number, reason?: string) {
        if (this.closed) return;

        await safeInvoke('ws_close', { id: this.id, code, reason } satisfies CloseArgs)
            .orTee(e => log.error(`Failed to close WS: ${e}`));
        this.dispose();
    }
}

export class DummyWSConnection extends BaseWSConnection {
    constructor(id: string, version: string = "v1") {
        super(id, version);
        setTimeout(() => this.connect(), 10);
    }

    public async sendRaw(text: string) {
        this.devAssertNotDisposed();
        log.info(`Dummy connection ${this.shortId} sent: ${text}`);
    }

    public async disconnect(code?: number, reason?: string) {
        if (this.closed) return;
        log.info(`Dummy connection ${this.shortId} disconnecting: ${reason || 'no reason'}`);
        this.dispose({ code: code || 1000, reason });
    }

    public receive(text: string) {
        this.message(text);
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
