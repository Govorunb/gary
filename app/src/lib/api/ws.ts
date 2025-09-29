import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { error, info } from "@tauri-apps/plugin-log";

export class GameWSConnection {
    private _closed: boolean = false;
    private subscriptions: Function[] = [];

    public get closed() {
        return this._closed;
    }

    constructor(
        public readonly id: string,
        public readonly version: string,
        private readonly channel: Channel<ServerWSEvent>,
        private onmessage: (msg: string) => any,
        private onclose: (clientDisconnect?: CloseFrame) => any,
    ) {
        listen<string>('ws-closed', (evt) => {
            if (evt.payload === this.id) this.close();
        }).then(this.subscriptions.push);
        this.channel.onmessage = this.processServerEvt;
    }

    get shortId() {
        return this.id.substring(0, 6);
    }

    close() {
        this._closed = true;
        for (const unsub of this.subscriptions) {
            unsub();
        }
    }

    checkClosed() {
        if (this._closed) throw new Error(`Connection id '${this.shortId}' is closed`);
    }

    processServerEvt(evt: ServerWSEvent) {
        switch (evt.type) {
            case "connected":
                // ???
                break;
            case "message":
                this.onmessage(evt.text);
                break;
            case "clientDisconnected":
                info(`client ${this.id.substring(0,6)} disconnected`);
                break;
        }
    }

    public send(msg: NeuroMessage): Promise<void> {
        return this.sendRaw(JSON.stringify(msg));
    }

    public async sendRaw(text: string) {
        this.checkClosed();
        try {
            await invoke('ws-send', { id: this.id, text } satisfies SendArgs);
        } catch (e) {
            error(`Failed to send WS text: ${e}`);
            throw e;
        }
    }

    public async disconnect(code?: number, reason?: string) {
        if (this._closed) return;

        await invoke('ws-close', { id: this.id, code, reason } satisfies CloseArgs);
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

export type ServerWSEvent = Connected | Message | ClientDisconnected;

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
