import type { Channel } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "svelte-sonner";
import type { NeuroMessage, GameMessage } from "./v1/spec";
import { listenSub, safeInvoke, type Awaitable, createListener } from "$lib/app/utils";
import { EVENT_BUS } from "$lib/app/events/bus";
import type { EventDef } from "$lib/app/events";

type OnMessageHandler = (msg: string) => Awaitable;
type OnCloseHandler = (clientDisconnected?: CloseFrame) => Awaitable;
type OnConnectHandler = () => Awaitable;
type OnErrorHandler = (err: string) => Awaitable;

export abstract class BaseConnection {
    #disposed: boolean = false;
    #connected: boolean = false;
    #onerror: OnErrorHandler[] = [];
    #onconnect: OnConnectHandler[] = [];
    #onmessage: OnMessageHandler[] = [];
    #onsend: OnMessageHandler[] = [];
    #onclose: OnCloseHandler[] = [];

    public get closed() {
        return this.#disposed;
    }

    public get connected() {
        return this.#connected;
    }

    constructor(
        public readonly id: string,
        public readonly version: string,
    ) {}

    get shortId() {
        return this.id.substring(0, 6);
    }

    public dispose(clientDisconnected?: CloseFrame) {
        this.#connected = false;
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
        EVENT_BUS.emit('api/conn/assert_not_disposed', { id: this.id });
    }

    protected abstract protocolSend(text: string): Promise<void>;

    public async sendRaw(text: string) {
        if (this.#disposed) return;
        // TODO: uh. was this meant to await (git blame for this line is scaring me)
        void this.protocolSend(text);
        for (const cbSend of this.#onsend) {
            await cbSend(text);
        }
    }

    public async receiveRaw(text: string) {
        if (this.#disposed) return;
        if (!this.#onmessage.length) {
            toast.warning(`Connection ${this.shortId} has no onmessage handlers!`);
            EVENT_BUS.emit('api/conn/no_onmessage_handlers', { id: this.id, text });
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
        this.#connected = true;
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
        if (this.#disposed) return;
        this.#onerror.push(handler);
    }
    public onconnect(handler: OnConnectHandler) {
        if (this.#disposed) return;
        if (this.#connected) {
            void handler();
        } else {
            this.#onconnect.push(handler);
        }
    }

    public onmessage(handler: OnMessageHandler) {
        if (this.#disposed) return;
        this.#onmessage.push(handler);
    }

    public onsend(handler: OnMessageHandler) {
        if (this.#disposed) return;
        this.#onsend.push(handler);
    }

    public onclose(handler: OnCloseHandler) {
        if (this.#disposed) return;
        this.#onclose.push(handler);
    }

    public listen() {
        return createListener<string>((next, done) => {
            this.onmessage(next);
            this.onclose(done);
        });
    }

    public listenSend() {
        return createListener<string>((next, done) => {
            this.onsend(next);
            this.onclose(done);
        });
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
            .orTee(e => {
                toast.error("Failed to send WS message", { description: e });
                EVENT_BUS.emit('api/conn/ws_tauri/send_failed', { id: this.id, text, err: e });
            });
    }

    public async disconnect(code?: number, reason?: string) {
        if (this.closed) return;

        await safeInvoke('ws_close', { id: this.id, code, reason } satisfies CloseArgs)
            .orTee(e => {
                toast.error("Failed to close WS", { description: e});
                EVENT_BUS.emit('api/conn/ws_tauri/close_failed', { id: this.id, err: e });
            });
        this.dispose();
    }

    protected clientDisconnect(clientDisconnected?: CloseFrame) {
        if (this.closed) return;
        EVENT_BUS.emit('api/conn/client_disconnected', { id: this.id });
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
        EVENT_BUS.emit('api/conn/internal/send', { id: this.id, text });
    }

    public async disconnect() {
        if (this.closed) return;
        EVENT_BUS.emit('api/conn/internal/disconnect', { id: this.id });
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

type CommonData = { id: string };
type TextData = CommonData & { text: string };
type TauriData = CommonData & { err: string };
type TauriTextData = TextData & TauriData;

export const EVENTS = [
    {
        // FIXME: dev/assert/
        key: 'api/conn/assert_not_disposed',
        dataSchema: {} as CommonData,
        description: 'Dev assertion: attempted to use disposed connection',
    },
    {
        // FIXME: dev/assert/
        key: 'api/conn/no_onmessage_handlers',
        dataSchema: {} as TextData,
        description: 'Dev assertion: Message received but no handlers registered',
    },
    {
        key: 'api/conn/ws_tauri/send_failed',
        dataSchema: {} as TauriTextData,
        description: 'Tauri failed to send WebSocket text',
    },
    {
        key: 'api/conn/ws_tauri/close_failed',
        dataSchema: {} as TauriData,
        description: 'Tauri failed to close WebSocket',
    },
    {
        key: 'api/conn/client_disconnected',
        dataSchema: {} as CommonData,
        description: 'Client disconnected from connection',
    },
    {
        key: 'api/conn/internal/send',
        dataSchema: {} as TextData,
        description: 'Internal connection sent text',
    },
    {
        key: 'api/conn/internal/disconnect',
        dataSchema: {} as CommonData,
        description: 'Internal connection disconnected',
    },
] as const satisfies EventDef<'api/conn'>[];
