import r from "$lib/app/utils/reporting";
import Ajv from "ajv";
import type { ConnectionClient } from "$lib/api/connection";
import * as v1 from "$lib/api/v1/spec";
import { jsonParse, safeParse } from "../app/utils";

export type ActionResult = Omit<v1.ActionResult['data'], 'id'>;

export abstract class ClientGame {
    protected readonly ajv = new Ajv({ validateFormats: false });
    public readonly registeredActions = new Map<string, v1.Action>();

    constructor(
        public readonly name: string,
        public readonly conn: ConnectionClient
    ) {
        conn.conn.onclose(() => this.dispose());
    }

    public async recvRaw(text: string) {
        const msg = jsonParse(text)
            .andThen(m => safeParse(v1.zNeuroMessage, m))
            .orTee(e => r.error(`Failed to parse message`, String(e)));
        if (msg.isOk()) {
            await this.recv(msg.value);
        }
    }

    public async recv(msg: v1.NeuroMessage) {
        switch (msg.command) {
            case "action":
                await this.action(msg.data);
                break;
            case "actions/reregister_all":
                await this.reregisterAll();
                break;
            default:
                r.warn(`Unhandled message type: ${(msg as any).command}`);
        }
    }

    protected async action(actionData: v1.ActData) {
        const { id, name, data } = actionData;
        let parsedData: any = null;

        if (data) {
            const res = jsonParse(data);
            if (res.isErr()) {
                await this.sendActionResult(id, false, `Invalid JSON data: ${res.error}`);
                return;
            }
            parsedData = res.value;
        }

        const { success, message } = await this.runAction(name, parsedData);
        await this.sendActionResult(id, success, message);
    }

    public async hello() {
        await this.conn.send(v1.zStartup.decode({game: this.name}));
    }

    public async reregisterAll() {
        const toReregister = this.registeredActions.values().toArray();
        await this.unregisterActions(toReregister.map(a => a.name));
        await this.registerActions(toReregister);
    }

    public abstract runAction(name: string, data: any): Promise<ActionResult>;

    public async registerActions(actions: v1.Action[]) {
        actions.forEach(action => this.registeredActions.set(action.name, action));
        const message: v1.RegisterActions = v1.zRegisterActions.decode({
            game: this.name,
            data: { actions }
        });
        await this.conn.send(message);
    }

    public async unregisterActions(actionNames: string[]) {
        actionNames.forEach(name => this.registeredActions.delete(name));
        const message: v1.UnregisterActions = v1.zUnregisterActions.decode({
            game: this.name,
            data: { action_names: actionNames }
        });
        await this.conn.send(message);
    }

    public async sendActionResult(id: string, success: boolean, message?: string) {
        const result: v1.ActionResult = v1.zActionResult.decode({
            game: this.name,
            data: { id, success, message: message || "" }
        });
        await this.conn.send(result);
    }

    public async sendContext(message: string, silent: boolean = false) {
        const context: v1.Context = v1.zContext.decode({
            game: this.name,
            data: { message, silent }
        });
        await this.conn.send(context);
    }

    public async sendForce(actionNames: string[], query: string, state?: string, ephemeralContext?: boolean, priority?: "low" | "medium" | "high" | "critical") {
        const force: v1.ForceAction = v1.zForceAction.decode({
            game: this.name,
            data: {
                action_names: actionNames,
                query,
                state,
                ephemeral_context: ephemeralContext,
                priority
            }
        });
        await this.conn.send(force);
    }

    public validateData(schema: any, data: any): { valid: boolean; error?: string } {
        if (!schema) {
            return { valid: true };
        }

        try {
            const validate = this.ajv.compile(schema);
            const valid = validate(data);

            if (!valid && validate.errors) {
                const errorMessages = validate.errors.map(err =>
                    `${err.instancePath || 'root'}: ${err.message}`
                ).join(', ');
                return { valid: false, error: errorMessages };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, error: `Could not validate data: ${error}` };
        }
    }

    dispose() {}
}
