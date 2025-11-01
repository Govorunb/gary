import { Channel } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as log from "@tauri-apps/plugin-log";
import type { NeuroMessage } from "./v1/spec";
import { safeInvoke } from "$lib/app/utils.svelte";

type OnMessageHandler = (msg: string) => any;
type OnCloseHandler = (clientDisconnected?: CloseFrame) => void;
type OnConnectHandler = () => Promise<void>;
type OnWSErrorHandler = (err: string) => Promise<void>;

export class GameWSConnection {
    #disposed: boolean = false;
    private subscriptions: UnlistenFn[] = [];
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
        private readonly channel: Channel<ServerWSEvent>,
    ) {
        listen<string>('ws-closed', (evt) => {
            if (evt.payload === this.id) this.dispose();
        }).then(unsub => this.subscriptions.push(unsub));
        this.channel.onmessage = (e) => this.processServerEvt(e);
    }

    get shortId() {
        return this.id.substring(0, 6);
    }

    public dispose(clientDisconnected?: CloseFrame) {
        this.#disposed = true;
        this.onconnect = undefined;
        this.onmessage = undefined;
        this.onwserror = undefined;
        this.subscriptions.forEach(unsub => unsub());
        this.subscriptions.length = 0;
        this.onclose?.(clientDisconnected);
        this.onclose = undefined;
    }

    devAssertNotDisposed() {
        if (this.#disposed) throw new Error(`Connection id '${this.shortId}' is closed`);
    }

    async processServerEvt(evt: ServerWSEvent) {
        if (this.#disposed) return;
        switch (evt.type) {
            case "connected":
                await this.onconnect?.();
                break;
            case "message":
                if (this.onmessage) {
                    await this.onmessage(evt.text);
                } else {
                    log.warn(`Connection ${this.shortId} received a WS message but has no onmessage handler! I have no mouth and I must scream`);
                }
                break;
            case "clientDisconnected":
                log.info(`client ${this.shortId} disconnected`);
                this.dispose(evt);
                break;
            case "wsError":
                // server websocket will close itself
                await this.onwserror?.(evt.err);
                this.dispose();
                break;
        }
    }

    public send(msg: NeuroMessage): Promise<void> {
        return this.sendRaw(JSON.stringify(msg));
    }

    public async sendRaw(text: string) {
        this.devAssertNotDisposed();
        await safeInvoke('ws_send', { id: this.id, text } satisfies SendArgs)
            .orTee(e => log.error(`Failed to send WS text: ${e}`));
    }

    public async disconnect(code?: number, reason?: string) {
        if (this.#disposed) return;

        await safeInvoke('ws_close', { id: this.id, code, reason } satisfies CloseArgs)
            .orTee(e => log.error(`Failed to close WS: ${e}`));
        this.dispose();
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
