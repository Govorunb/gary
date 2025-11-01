import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as log from "@tauri-apps/plugin-log";
import type { NeuroMessage } from "./v1/spec";
import { toast } from "svelte-sonner";

type OnMessageHandler = (msg: string) => any;
export type OnCloseHandler = (clientDisconnected?: CloseFrame) => void;

export class GameWSConnection {
    private _closed: boolean = false;
    private subscriptions: Function[] = [];
    public onmessage?: OnMessageHandler;
    public onclose?: OnCloseHandler;

    public get closed() {
        return this._closed;
    }

    constructor(
        public readonly id: string,
        public readonly version: string,
        private readonly channel: Channel<ServerWSEvent>,
    ) {
        listen<string>('ws-closed', (evt) => {
            if (evt.payload === this.id) this.dispose();
        }).then(this.subscriptions.push);
        this.channel.onmessage = (e) => this.processServerEvt(e);
    }

    get shortId() {
        return this.id.substring(0, 6);
    }

    public dispose(clientDisconnected?: CloseFrame) {
        this._closed = true;
        this.onmessage = undefined;
        for (const unsub of this.subscriptions) {
            unsub();
        }
        this.subscriptions.length = 0;
        this.onclose?.(clientDisconnected);
        this.onclose = undefined;
    }

    checkClosed() {
        // dev time assertion, throwing is fine here
        if (this._closed) throw new Error(`Connection id '${this.shortId}' is closed`);
    }

    async processServerEvt(evt: ServerWSEvent) {
        if (this._closed) return;
        switch (evt.type) {
            case "connected":
                // ??? log i guess (or some ui update)
                toast.info(`Game ${this.shortId} connected`);
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
                log.warn(`client ${this.shortId} broke its websocket: ${evt.err}`);
                toast.error(`Game ${this.shortId} broke its websocket: ${evt.err}`);
                // server websocket will close itself
                this.dispose();
                break;
        }
    }

    public send(msg: NeuroMessage): Promise<void> {
        return this.sendRaw(JSON.stringify(msg));
    }

    public async sendRaw(text: string) {
        this.checkClosed();
        try {
            await invoke('ws_send', { id: this.id, text } satisfies SendArgs);
        } catch (e) {
            log.error(`Failed to send WS text: ${e}`);
            throw e;
        }
    }

    public async disconnect(code?: number, reason?: string) {
        if (this._closed) return;

        try {
            await invoke('ws_close', { id: this.id, code, reason } satisfies CloseArgs);
        } finally {
            this.dispose();
        }
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
