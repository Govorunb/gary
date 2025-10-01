import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { error, info, warn } from "@tauri-apps/plugin-log";
import type { NeuroMessage } from "./v1/spec";

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
            if (evt.payload === this.id) this.close();
        }).then(this.subscriptions.push);
        this.channel.onmessage = (e) => this.processServerEvt(e);
    }

    get shortId() {
        return this.id.substring(0, 6);
    }

    public close(clientDisconnected?: CloseFrame) {
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
        if (this._closed) throw new Error(`Connection id '${this.shortId}' is closed`);
    }

    async processServerEvt(evt: ServerWSEvent) {
        if (this._closed) return;
        switch (evt.type) {
            case "connected":
                // ??? log i guess (or some ui update)
                break;
            case "message":
                if (this.onmessage) {
                    await this.onmessage(evt.text);
                } else {
                    warn(`Connection ${this.shortId} received a WS message but has no onmessage handler! I have no mouth and I must scream`);
                }
                break;
            case "clientDisconnected":
                info(`client ${this.shortId} disconnected`);
                this.close(evt);
                break;
            case "wsError":
                warn(`client ${this.shortId} broke its websocket: ${evt.err}`);
                // server websocket will close itself
                this.close();
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
            error(`Failed to send WS text: ${e}`);
            throw e;
        }
    }

    public async disconnect(code?: number, reason?: string) {
        if (this._closed) return;

        await invoke('ws_close', { id: this.id, code, reason } satisfies CloseArgs);
        this.close();
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
