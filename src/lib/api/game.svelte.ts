import type { Session } from "$lib/app/session.svelte";
import { formatZodError, jsonParse, localeTimeWithMs, safeParse, LogLevel, PriorityQueue } from "$lib/app/utils";
import { SvelteMap } from "svelte/reactivity";
import { GameDiagnostics } from "./game-diagnostics.svelte";
import { TIMEOUTS } from "./diagnostics";
import * as v1 from "./v1/spec";
import type { BaseConnection } from "./connection";
import dayjs from "dayjs";
import { dequal } from "dequal/lite";
import { findUnsupportedSchemaKeywords } from "./helpers";
import type { JSONSchema } from "openai/lib/jsonschema";
import type { EventDef, Keys, PresentDefs } from "$lib/app/events";
import { EVENT_BUS } from "$lib/app/events/bus";

export type GameAction = v1.Action & { active: boolean };
export type PendingAction = {
    actData: v1.ActData,
    sentAt: number,
    timeout: ReturnType<typeof setTimeout>,
};
export type QueuedGameForce = {
    data: v1.ForceAction["data"];
    retryCount?: number;
};
// the force in progress. keeps its slot through retries (queued forces wait behind it)
export type ActiveForce = QueuedGameForce & {
    actions: v1.Action[];
    phase: "generating" | "sent" | "retry";
    actId?: string;
};
export type ForceDropReason = "retry_exhausted" | "actions_unregistered" | "not_sent" | "preempted";

const FORCE_RETRY_LIMIT = 3;
const ACTION_RESULT_TIMEOUT = 20_000; // spec 2026-09

export class Game {
    public readonly actions = $state(new SvelteMap<string, GameAction>());
    public name: string = $state(null!);
    public diagnostics = new GameDiagnostics(this);
    public status = $derived(this.diagnostics.status);
    public startupState: { type: "connected" | "implied" | "startup"; at: number; } | null = $state(null);
    private pendingActions = $state(new SvelteMap<string, PendingAction>());
    private forceQueueValues: QueuedGameForce[] = $state([]);
    private forceQueue = new PriorityQueue(
        force => v1.FORCE_PRIORITY[force.data.priority],
        this.forceQueueValues,
    );
    private activeForce: ActiveForce | null = $state(null);
    
    public get id() {
        return this.conn.id;
    }

    public get shortId() {
        return this.conn.shortId;
    }

    constructor(
        public readonly session: Session,
        public readonly conn: BaseConnection,
        name?: string
    ) {
        this.name = name ?? v1PendingGameName(conn.id);
        conn.onconnect(() => {
            this.startupState = { type: "connected", at: Date.now() };
            if (conn.version !== "v1") {
                this.connected();
            }
        });
        conn.onclose(() => {
            if (this.name === v1PendingGameName(conn.id)) return;
            EVENT_BUS.emit('api/game/disconnected', { game: { id: this.id, name: this.name } });
            this.clearPendingActions();
            this.forceQueue.clear();
            this.activeForce = null;
        });
        conn.onmessage((txt) => this.recv(txt));
        conn.onerror((err) => {
            EVENT_BUS.emit('api/game/conn_error', { game: { id: this.id, name: this.name }, err });
        });
    }

    public get version() {
        return this.conn.version;
    }

    public get hasQueuedForce() {
        return this.nextForcePriority !== null;
    }

    public get hasForce() {
        return !!this.activeForce || this.forceQueue.length > 0;
    }

    // none when waiting for a result
    public get nextForcePriority(): v1.ForcePriority | null {
        if (this.pendingActions.size) return null;
        if (this.activeForce) {
            return this.activeForce.phase === "retry" ? this.activeForce.data.priority : null;
        }
        return this.forceQueue.peek()?.data.priority ?? null;
    }

    // retries stay at the front
    public takeForce(): ActiveForce | null {
        if (this.nextForcePriority === null) return null;
        const retry = this.activeForce;
        this.activeForce = null;
        for (let force = retry ?? this.forceQueue.dequeue(); force; force = this.forceQueue.dequeue()) {
            const actions = this.resolveForceActions(force.data);
            if (!actions.length) {
                this.emitForceDropped(force, "actions_unregistered");
                continue;
            }
            this.activeForce = { ...force, actions, phase: "generating" };
            return this.activeForce;
        }
        return null;
    }

    public completeForce() {
        if (this.activeForce?.phase === "generating") this.closeForce("not_sent");
    }

    // called on engine errors
    public failForce() {
        // the game's still waiting on us
        if (this.activeForce?.phase === "generating") this.retryForce();
    }

    private closeForce(reason: ForceDropReason | "completed") {
        const force = this.activeForce!;
        this.activeForce = null;
        if (reason !== "completed") this.emitForceDropped(force, reason);
        this.wakeScheduler();
    }

    // v1 spec: failed forced actions get retried
    private retryForce() {
        const force = this.activeForce!;
        const retries = force.retryCount ?? 0;
        if (retries >= FORCE_RETRY_LIMIT) return this.closeForce("retry_exhausted");
        force.retryCount = retries + 1;
        force.phase = "retry";
        this.wakeScheduler();
    }

    private enqueueForce(force: QueuedGameForce) {
        const critical = force.data.priority === "critical";
        const discarded = this.forceQueue.enqueue(force, { discardLower: critical });
        const active = this.activeForce;
        if (critical && active?.phase === "retry" && active.data.priority !== "critical") {
            this.activeForce = null;
            discarded.push(active);
        }
        for (const dropped of discarded) this.emitForceDropped(dropped, "preempted");
        // unconditional on purpose (not wakeScheduler)
        this.session.scheduler.onGameForce(force.data.priority);
    }

    private resolveForceActions(data: v1.ForceAction["data"]) {
        return data.action_names.map(name => this.getAction(name)!).filter(Boolean);
    }

    private emitForceDropped(force: QueuedGameForce, reason: ForceDropReason) {
        EVENT_BUS.emit('api/game/force_dropped', {
            game: { id: this.id, name: this.name },
            reason,
            ...force.data,
        });
    }

    private wakeScheduler() {
        if (this.nextForcePriority) {
            this.session.scheduler.onGameForce(this.nextForcePriority);
        }
    }

    public get gamePrefs() {
        return this.session.userPrefs.getGamePrefs(this.name);
    }

    private connected() {
        EVENT_BUS.emit('api/game/connected', { game: { id: this.id, name: this.name } });
    }

    async recv(txt: string) {
        const msg = jsonParse(txt).mapErr(e => `Failed to parse JSON: ${e}`)
            .andThen(json => safeParse(v1.zGameMessage, json).mapErr(e => formatZodError(e).join("\n")));
        if (msg.isOk()) {
            await this.processMsg(msg.value);
        } else {
            this.diagnostics.trigger("prot/invalid_message", { message: txt, error: msg.error });
        }
    }

    async processMsg(msg: v1.GameMessage) {
        EVENT_BUS.emit('api/game/recv', {game: {id: this.id, name: this.name}, msg});
        if (this.conn.version === "v1") {
            // technically vulnerable but i'd like to see a game out in the wild actually guess its own id
            if (this.name === v1PendingGameName(this.conn.id)) {
                EVENT_BUS.emit('api/game/v1/name', { game: {id: this.id, name: msg.game}});
                this.name = msg.game;
                this.connected();
            } else if (this.name !== msg.game) {
                this.diagnostics.trigger("prot/v1/game_renamed", { old: this.name, new: msg.game });
                // allowed for now but eventually will have to remove this (too much complexity)
                this.name = msg.game;
            }
        }
        const command = msg.command;
        switch (command) {
            case "startup":
                await this.startup();
                break;
            case "context":
                this.context(msg.data.message, msg.data.silent);
                break;
            case "actions/register":
                this.registerActions(msg.data.actions);
                break;
            case "actions/unregister":
                this.unregisterActions(msg.data.action_names);
                break;
            case "actions/force":
                await this.forceAction(msg);
                break;
            case "action/result":
                await this.actionResult(msg);
                break;
            case "shutdown/ready":
                break;
            default:
                EVENT_BUS.emit('api/game/assert_unimplemented_command', { game: { id: this.id, name: this.name }, command });
        }
        if (!["startup", "implied"].includes(this.startupState?.type ?? "")) {
            this.diagnostics.trigger("prot/startup/missing", { firstMessage: { msg } });
            this.startupState = { type: "implied", at: Date.now() };
        }
    }

    async startup() {
        EVENT_BUS.emit('api/game/startup', {
            game: {id: this.id, name: this.name},
            startupStateWas: this.startupState,
        });
        if (this.startupState?.type === "startup") {
            this.diagnostics.trigger("prot/startup/multiple");
        } else {
            const now = Date.now();
            const startupDelay = now - (this.startupState?.at ?? now);
            this.startupState = { type: "startup", at: now };
            if (startupDelay > TIMEOUTS["perf/late/startup"]) {
                this.diagnostics.trigger("perf/late/startup", { delayMs: startupDelay });
            }
        }
        const { characterId, displayName } = this.session.userPrefs.app.character;
        await this.conn.send(v1.zStartupAck.decode({
            data: {
                session: {
                    sessionId: this.id,
                    characterId,
                    displayName,
                },
            },
        }));
        // TODO: diag suggest sending context (game info/rules) on connect
        // (like a 1s timer after startup or sth)
    }

    context(text: string, silent: boolean) {
        EVENT_BUS.emit('api/game/context', {
            game: { id: this.id, name: this.name },
            message: text,
            silent,
        });
    }

    getAction(name: string, onlyActive: boolean = true) {
        const action = this.actions.get(name);
        if (onlyActive && !action?.active)
            return undefined;
        return action;
    }

    getActiveActions() {
        return Array.from(this.actions.values().filter(a => a.active));
    }

    private checkActionSchema(action: v1.Action) {
        const { name, schema } = action;
        if (!schema) return;
        // for some reason spec allows {} for parameterless actions (some quantity of zaza was definitely involved)
        // there's some tricks with hasOwn and Object.keys and all that funny stuff
        // but this object comes from JSON.parse so we don't need to be clever at all
        let isEmpty = true;
        for (const _ in schema) {
            isEmpty = false;
            break;
        }
        if (isEmpty) {
            this.diagnostics.trigger("prot/schema/prefer_omit_to_empty", { action: name }, false);
            return;
        }
        const unsupportedKeywords = new Set(findUnsupportedSchemaKeywords(schema as JSONSchema));
        if (unsupportedKeywords.size > 0) {
            this.diagnostics.trigger("prot/schema/unsupported_keywords", {
                action: name,
                keywords: Array.from(unsupportedKeywords),
            }, false);
        }
        if (schema.type !== "object") {
            this.diagnostics.trigger("prot/schema/type_object", { action: name, schema }, false);
        }

        if (!('additionalProperties' in schema)) {
            this.diagnostics.trigger("prot/schema/additionalProperties", { action: name, schema }, false);
        }
    }

    private normalizeAction(action: v1.Action): v1.Action {
        if (!action.schema || "additionalProperties" in action.schema) {
            return action;
        }
        return {
            ...action,
            schema: {
                ...action.schema,
                additionalProperties: false,
            },
        };
    }

    async registerActions(actions: v1.Action[]) {
        const newActions = [];
        for (const incomingAction of actions) {
            const action = this.normalizeAction(incomingAction);
            const existing = this.actions.get(action.name);
            let schemaUpdated = false;
            if (!existing) {
                newActions.push(action.name);
                schemaUpdated = true;
            } else {
                const {active: wasActive, ...rawExisting} = existing;
                if (!dequal(action.schema, rawExisting.schema)) {
                    schemaUpdated = true;
                }
                if (wasActive) {
                    EVENT_BUS.emit('api/game/register/duplicate', {
                        game: {id: this.id, name: this.name, version: this.version},
                        old: rawExisting,
                        new: action,
                    });
                    // duplicate action conflict resolution
                    // v1 drops incoming (ignore new), v2 onwards will drop existing (overwrite with new)
                    const isV1 = this.version === "v1";
                    const isIdentical = action.description === rawExisting.description
                        && !schemaUpdated;
                    if (isIdentical) {
                        this.diagnostics.trigger("perf/register/identical_duplicate", { action: action.name });
                        continue; // skip since it doesn't matter (already active too)
                    } else if (isV1) {
                        this.diagnostics.trigger("prot/v1/register/conflict", {
                            incoming: action,
                            existing: rawExisting,
                        });
                    }
                    if (isV1) continue;
                }
            }
            if (schemaUpdated) {
                this.checkActionSchema(incomingAction);
            }
            if (!action.description) {
                this.diagnostics.trigger("prot/action/no_desc", { action: action.name });
            }
            const storedAction = $state({ ...action, active: true });
            this.actions.set(action.name, storedAction);
        }
        EVENT_BUS.emit('api/game/register', {game: {id: this.id, name: this.name}, actions, newActions});
    }

    async unregisterActions(actions: string[]) {
        for (const action_name of actions) {
            const existing = this.getAction(action_name, false);
            if (!existing) {
                this.diagnostics.trigger("prot/unregister/unknown", { action_name });
            } else if (!existing.active) {
                this.diagnostics.trigger("prot/unregister/inactive", { action_name });
            } else {
                existing.active = false;
            }
        }
        EVENT_BUS.emit('api/game/unregister', { game: { id: this.id, name: this.name }, action_names: actions });
    }

    async forceAction(msg: v1.ForceAction) {
        if (this.pendingActions.size) {
            this.diagnostics.trigger("prot/force/while_pending_result", {
                pending: this.pendingActions.values().map(prettyPending).toArray(),
                msg,
            });
        }
        const actions = this.resolveForceActions(msg.data);
        if (msg.data.action_names.length === 0) {
            this.diagnostics.trigger("prot/force/empty", { msgData: msg.data });
            return;
        }
        if (actions.length < msg.data.action_names.length) {
            if (actions.length === 0) {
                this.diagnostics.trigger("prot/force/all_invalid", { msgData: msg.data });
                return;
            } else {
                this.diagnostics.trigger("prot/force/some_invalid", { msgData: msg.data, unknownActions: msg.data.action_names.filter(name => !this.getAction(name)) });
            }
        }
        if (this.hasForce) {
            this.diagnostics.trigger("prot/force/multiple", { msgData: msg.data });
        }
        this.enqueueForce({ data: msg.data });
        EVENT_BUS.emit('api/game/force', {
            game: { id: this.id, name: this.name },
            ...msg.data,
        });
    }

    // scheduler only runs one act at a time, so if a force is generating this is its act
    async sendAction(actData: v1.ActData, toolCallId?: string) {
        EVENT_BUS.emit('api/game/act/actor', {
            game: { id: this.id, name: this.name },
            act: actData,
            toolCallId,
        });
        if (this.activeForce?.phase === "generating") {
            this.activeForce.phase = "sent";
            this.activeForce.actId = actData.id;
        }
        await this.dispatchAction(actData);
    }

    private async dispatchAction(actData: v1.ActData) {
        const sentAt = Date.now();
        const timeout = setTimeout(() => {
            this.diagnostics.trigger("perf/timeout/action_result", prettyPending(pending));
            pending.timeout = setTimeout(
                () => this.settleAction(pending, false),
                ACTION_RESULT_TIMEOUT - TIMEOUTS["perf/timeout/action_result"]
            );
        }, TIMEOUTS["perf/timeout/action_result"]);
        const pending: PendingAction = { actData, sentAt, timeout };
        this.pendingActions.set(actData.id, pending);
        await this.conn.send(v1.zAct.decode({data: actData}));
    }

    private settleAction({ actData: { id }, timeout }: PendingAction, success: boolean) {
        clearTimeout(timeout);
        this.pendingActions.delete(id);
        if (this.activeForce?.actId === id) {
            if (this.version === "v1" && !success) {
                this.retryForce();
            } else {
                this.closeForce("completed");
            }
        } else {
            this.wakeScheduler();
        }
    }

    sendSpeechFinished() {
        return this.conn.send(v1.zSpeechFinished.decode({data: {isFinal: true}}));
    }

    async actionResult(msg: v1.ActionResult) {
        const { id, success, message } = msg.data;
        const pending = this.pendingActions.get(id);
        if (!pending) {
            this.diagnostics.trigger("prot/result/unexpected", { msgData: msg.data });
            return;
        }
        const { actData, sentAt } = pending;
        const diff = Date.now() - sentAt;
        if (diff > TIMEOUTS["perf/late/action_result"]) {
            this.diagnostics.trigger("perf/late/action_result", prettyPending(pending));
        }
        if (!success && !message) {
            this.diagnostics.trigger("prot/result/error_nomessage");
        }
        EVENT_BUS.emit('api/game/action_result', {
            game: { id: this.id, name: this.name },
            act: actData,
            success,
            message,
        });
        this.settleAction(pending, success);
    }

    async manualSend(action: string, data?: string) {
        const actData = v1.zActData.decode({
            name: action,
            data,
        });
        EVENT_BUS.emit('api/game/act/user', { game: { id: this.id, name: this.name }, act: actData });
        await this.dispatchAction(actData);
    }

    toString() {
        return `Game { name: "${this.name}", version: "${this.version}"}`;
    }

    private clearPendingActions() {
        for (const [_id, {timeout}] of this.pendingActions) {
            clearTimeout(timeout);
        }
        this.pendingActions.clear();
    }
}

export function v1PendingGameName(id: string) {
    return `<v1-Pending-${id}>`;
}

function prettyPending(p: PendingAction) {
    return {
        act: p.actData,
        sentAt: localeTimeWithMs(dayjs(p.sentAt))
    };
}

type GameEventData = { game: { id: string, name: string } };

export const EVENTS = [
    {
        key: 'api/game/connected',
        dataSchema: {} as GameEventData,
        level: LogLevel.Info,
    },
    {
        key: 'api/game/disconnected',
        dataSchema: {} as GameEventData,
        level: LogLevel.Info,
    },
    {
        key: 'api/game/conn_error',
        dataSchema: {} as GameEventData & { err: string },
        level: LogLevel.Error,
    },
    {
        key: 'api/game/recv',
        dataSchema: {} as GameEventData & { msg: v1.GameMessage },
        description: "Processing game message",
        level: LogLevel.Debug,
    },
    {
        // FIXME: dev/assert/
        key: 'api/game/assert_unimplemented_command',
        dataSchema: {} as GameEventData & { command: string },
        level: LogLevel.Warning,
    },
    {
        key: 'api/game/startup',
        dataSchema: {} as GameEventData & { startupStateWas: Game['startupState'] },
        description: "Game sent startup",
        level: LogLevel.Info,
    },
    {
        key: 'api/game/context',
        dataSchema: {} as GameEventData & v1.Context['data'],
        description: "Game sent context",
        level: LogLevel.Info,
    },
    {
        key: 'api/game/register',
        dataSchema: {} as GameEventData & v1.RegisterActions['data'] & { newActions: string[] },
        description: "Game registered actions",
        level: LogLevel.Debug,
    },
    {
        key: 'api/game/unregister',
        dataSchema: {} as GameEventData & v1.UnregisterActions['data'],
        description: "Game unregistered actions",
        level: LogLevel.Debug,
    },
    {
        key: 'api/game/force',
        dataSchema: {} as GameEventData & v1.ForceAction['data'],
        description: "Game forced an action",
        level: LogLevel.Info,
    },
    {
        key: 'api/game/force_dropped',
        dataSchema: {} as GameEventData & v1.ForceAction['data'] & { reason: ForceDropReason },
        description: "Force dropped without a successful action",
        level: LogLevel.Warning,
    },
    {
        key: 'api/game/v1/name',
        dataSchema: {} as GameEventData,
        description: "First message for v1 game - taking game name from WS msg",
        level: LogLevel.Debug,
    },
    {
        key: 'api/game/register/duplicate',
        dataSchema: {} as GameEventData & { game: {version: Game['version']}, old: v1.Action, new: v1.Action },
        description: "Game re-registered an action",
        level: LogLevel.Info,
    },
    {
        key: 'api/game/act/actor',
        dataSchema: {} as GameEventData & { act: v1.ActData; toolCallId?: string },
        description: "Sent actor action to game",
        level: LogLevel.Info,
    },
    {
        key: 'api/game/act/user',
        dataSchema: {} as GameEventData & { act: v1.ActData },
        description: "Sent user action to game",
        level: LogLevel.Debug,
    },
    {
        key: 'api/game/action_result',
        dataSchema: {} as GameEventData & { act: v1.ActData; success: boolean; message?: string },
        description: "Game sent action result",
        level: LogLevel.Info,
    },
] as const satisfies EventDef<'api/game'>[];

export const DISPLAY = {
    "api/game/connected": ({ game }) => ({
        title: `${game.name} connected`,
    }),
    "api/game/disconnected": ({ game }) => ({
        title: `${game.name} disconnected`,
    }),
    "api/game/conn_error": ({ game, err }) => ({
        title: `${game.name} broke its websocket somehow`,
        description: err,
    }),
    "api/game/assert_unimplemented_command": ({ game, command }) => ({
        title: `(${game.name}) Unimplemented command '${command}'`,
    }),
} as PresentDefs<Keys<typeof EVENTS>>;
