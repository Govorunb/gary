import r from "$lib/app/utils/reporting";
import type { GameWSSender } from "$lib/api/ws";
import { ClientGame } from "./client-game";
import * as v1 from "$lib/api/v1/spec";
import { type ActionResult } from './client-game';
import { TEST_ACTIONS_MAP } from "./actions";


export class SchemaTestGame extends ClientGame {
    private readonly actions = TEST_ACTIONS_MAP;
    private schemaChanged = false;
    private samsara = true; // when there's no more actions left, reregister them all again

    constructor(conn: GameWSSender) {
        super("JSON Schema Test", conn);
    }

    public async lifecycle() {
        await this.hello();
        for await (const msg of this.conn.listen()) {
            await this.handleMessage(msg);
        }
        this.dispose();
    }

    protected getActions(): v1.Action[] {
        return Array.from(this.actions.values());
    }

    protected async processAction(name: string, data: any): Promise<ActionResult> {
        let res: ActionResult;
        if (name === "schema_update") {
            res = await this.schemaUpdateHandler(name, data);
        } else {
            res = await this.defaultHandler(name, data);
        }

        if (this.samsara && this.registeredActions.size === 0) {
            r.info("[schema-test] No more actions - reregistering all. The eternal cycle continues");
            await this.resetActions();
        }

        return res;
    }

    private async defaultHandler(name: string, data: any): Promise<ActionResult> {
        const action = this.actions.get(name);

        if (!action) {
            r.error(`[schema-test] Unknown action: ${name}`);
            return { success: false, message: `Unknown action '${name}'` };
        }

        if (!this.registeredActions.has(name)) {
            r.warn(`[schema-test] Called '${name}' out of turn (unregistered)`);
        }

        const validation = this.validateData(action.schema, data);
        if (!validation.valid) {
            r.warn(`[schema-test] '${name}' failed validation`, `Error: ${validation.error}\nData: ${JSON.stringify(data)}`);
            return { success: false, message: `Invalid data: ${validation.error}` };
        }
        r.info(`[schema-test] [${name}] Success`);

        this.registeredActions.delete(name);
        await this.unregisterActions([name]);

        return {
            success: true,
            message: `Echo: ${name}=${JSON.stringify(data)}`
        };
    }

    private async schemaUpdateHandler(name: string, data: any): Promise<ActionResult> {
        const res = await this.defaultHandler(name, data);
        if (!res.success) return res;
        
        if (!this.schemaChanged) {
            this.schemaChanged = true;
            const action = this.actions.get(name);
            if (action) {
                const updatedAction = { ...action, schema: { "type": "string" } };
                this.actions.set(name, updatedAction);
                this.registeredActions.set(name, updatedAction);

                res.message = "Schema updated - try again";
                await this.registerActions([updatedAction]);
            }
        }
        
        return res;
    }

    protected async hello() {
        r.info(`[schema-test] Registering ${this.actions.size} actions`);
        super.hello();
        
        await this.sendContext(
            "Welcome to the JSON Schema test. Please execute the actions available to you.\n" +
            "You may deviate from the given schema, it is part of the test.",
            true
        );
    }

    protected async resetActions(): Promise<void> {
        this.registeredActions.clear();
        await this.registerActions(Array.from(this.actions.values()));
        this.schemaChanged = false;
    }
}