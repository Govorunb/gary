import * as log from "@tauri-apps/plugin-log";
import Ajv from "ajv";
import type { GameWSSender } from "$lib/api/ws";
import * as v1 from "$lib/api/v1/spec";
import { jsonParse, safeParse } from "../utils";

export type ActionResult = Omit<v1.ActionResult['data'], 'id'>;

export abstract class ClientGame {
    protected readonly ajv = new Ajv({ validateFormats: false });
    protected forceActionInterval?: ReturnType<typeof setInterval>;
    protected readonly registeredActions = new Map<string, v1.Action>();

    constructor(
        protected readonly name: string,
        protected readonly conn: GameWSSender
    ) {}

    protected async handleMessage(text: string) {
        const msg = jsonParse(text)
            .andThen(m => safeParse(v1.zNeuroMessage, m))
            .orTee(e => log.error(`Failed to parse message: ${e}`));
        if (msg.isOk()) {
            await this.handle(msg.value);
        }
    }

    protected async handle(msg: v1.NeuroMessage) {
        switch (msg.command) {
            case "action":
                await this.handleAction(msg.data);
                break;
            case "actions/reregister_all":
                await this.hello();
                break;
            default:
                log.warn(`Unhandled message type: ${(msg as any).command}`);
        }
    }

    protected async handleAction(actionData: v1.ActData) {
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

        const { success, message } = await this.processAction(name, parsedData);
        await this.sendActionResult(id, success, message);
    }

    protected async hello() {
        this.resetForceActionInterval();
        await this.resetActions();
    }

    protected abstract resetActions(): Promise<void>;

    protected abstract processAction(name: string, data: any): Promise<ActionResult>;

    protected async registerActions(actions: v1.Action[]) {
        actions.forEach(action => this.registeredActions.set(action.name, action));
        const message: v1.RegisterActions = v1.zRegisterActions.decode({
            command: "actions/register",
            game: this.name,
            data: { actions }
        });
        await this.conn.send(message);
    }

    protected async unregisterActions(actionNames: string[]) {
        actionNames.forEach(name => this.registeredActions.delete(name));
        const message: v1.UnregisterActions = v1.zUnregisterActions.decode({
            command: "actions/unregister",
            game: this.name,
            data: { action_names: actionNames }
        });
        await this.conn.send(message);
    }

    protected async sendActionResult(id: string, success: boolean, message?: string) {
        const result: v1.ActionResult = v1.zActionResult.decode({
            command: "action/result",
            game: this.name,
            data: { id, success, message: message || "" }
        });
        await this.conn.send(result);
    }

    protected async sendContext(message: string, silent: boolean = false) {
        const context: v1.Context = v1.zContext.decode({
            command: "context",
            game: this.name,
            data: { message, silent }
        });
        await this.conn.send(context);
    }

    protected resetForceActionInterval() {
        if (this.forceActionInterval) {
            clearInterval(this.forceActionInterval);
        }
        
        this.forceActionInterval = setInterval(async () => {
            if (!this.registeredActions.size) return;

            const force: v1.ForceAction = v1.zForceAction.decode({
                command: "actions/force",
                game: this.name,
                data: {
                    state: "",
                    query: "Please execute an action",
                    ephemeral_context: false,
                    action_names: Array.from(this.registeredActions.keys())
                }
            });
            await this.conn.send(force);
        }, 5000);
    }

    protected validateData(schema: any, data: any): { valid: boolean; error?: string } {
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

    dispose() {
        if (this.forceActionInterval) {
            clearInterval(this.forceActionInterval);
        }
    }
}