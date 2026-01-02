import r from "$lib/app/utils/reporting";
import { jsonParse } from "$lib/app/utils";
import type { ConnectionClient } from "$lib/api/connection";
import { ClientGame } from "../../api/client-game";
import type { ActionResult } from '../../api/client-game';
import { DIAGNOSTIC_ACTIONS_MAP } from "./actions";
import * as v1 from "$lib/api/v1/spec";

export class DiagnosticsExampleGame extends ClientGame {
    private readonly actions = DIAGNOSTIC_ACTIONS_MAP;

    constructor(conn: ConnectionClient) {
        super("Diagnostics Example", conn);
    }

    public async lifecycle() {
        await this.hello();
        for await (const msg of this.conn.listen()) {
            await this.recvRaw(msg);
        }
        this.dispose();
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

        const action = this.actions.get(name);
        if (!action) {
            await this.sendActionResult(id, false, `Unknown action '${name}'`);
            return;
        }

        await this.handler(name, id, parsedData);
    }

    private async handler(name: string, id: string, _data: any): Promise<void> {
        switch (name) {
            case "prot/force/empty": {
                const msg: v1.ForceAction = v1.zForceAction.decode({
                    game: this.name,
                    data: {
                        action_names: [],
                        query: "Test",
                    },
                });
                await this.sendActionResult(id, true, "Sent empty actions/force (check diagnostics)");
                await this.conn.send(msg);
                r.info(`[diagnostics-example] Sent empty actions/force`);
                break;
            }

            case "prot/force/some_invalid": {
                const msg: v1.ForceAction = v1.zForceAction.decode({
                    game: this.name,
                    data: {
                        action_names: ["test_action", "unknown_action_1", "unknown_action_2"],
                        query: "Test",
                    },
                });
                await this.sendActionResult(id, true, "Sent actions/force with some invalid actions (check diagnostics)");
                await this.conn.send(msg);
                r.info(`[diagnostics-example] Sent actions/force with some invalid actions`);
                break;
            }

            case "prot/force/all_invalid": {
                const msg: v1.ForceAction = v1.zForceAction.decode({
                    game: this.name,
                    data: {
                        action_names: ["unknown_action_1", "unknown_action_2"],
                        query: "Test",
                    },
                });
                await this.sendActionResult(id, true, "Sent actions/force with all invalid actions (check diagnostics)");
                await this.conn.send(msg);
                r.info(`[diagnostics-example] Sent actions/force with all invalid actions`);
                break;
            }

            case "prot/force/multiple": {
                const msg: v1.ForceAction = v1.zForceAction.decode({
                    game: this.name,
                    data: {
                        action_names: ["test_action"],
                        query: "Test",
                    },
                });
                await this.sendActionResult(id, true, "Sent two actions/force messages (check diagnostics)");
                await this.conn.send(msg);
                await this.conn.send(msg);
                r.info(`[diagnostics-example] Sent two actions/force messages`);
                break;
            }

            case "prot/unregister/unknown": {
                await this.sendActionResult(id, true, "Unregistered unknown action (check diagnostics)");
                await this.unregisterActions(["never_registered_action"]);
                r.info(`[diagnostics-example] Unregistered unknown action 'never_registered_action'`);
                break;
            }

            case "prot/unregister/inactive": {
                await this.sendActionResult(id, true, "Unregistered inactive action (check diagnostics)");
                const dummyAction: v1.Action = {
                    name: "dummy",
                    description: "Dummy action for prot/unregister/inactive",
                    schema: null,
                };
                await this.registerActions([dummyAction]);
                await this.unregisterActions([dummyAction.name]);
                await this.unregisterActions([dummyAction.name]);
                r.info(`[diagnostics-example] Unregistered inactive action`);
                break;
            }

            case "prot/v1/register/conflict": {
                const action = this.actions.get("test_action")!;
                await this.sendActionResult(id, true, "Registered same action twice (check diagnostics)");
                await this.registerActions([action]);
                await this.registerActions([action]);
                r.info(`[diagnostics-example] Registered same action twice`);
                break;
            }

            case "prot/startup/multiple": {
                const msg: v1.Startup = v1.zStartup.decode({
                    game: this.name,
                });
                await this.sendActionResult(id, true, "Sent two startup messages (check diagnostics)");
                await this.conn.send(msg);
                await this.conn.send(msg);
                r.info(`[diagnostics-example] Sent two startup messages`);
                break;
            }

            case "prot/force/while_pending_result": {
                const msg: v1.ForceAction = v1.zForceAction.decode({
                    game: this.name,
                    data: {
                        action_names: ["test_action"],
                        query: "Test",
                    },
                });
                await this.conn.send(msg);
                r.info(`[diagnostics-example] Sent actions/force with pending result`);
                await this.sendActionResult(id, true, "Sent actions/force with pending result (check diagnostics)");
                break;
            }

            case "perf/late/action_result": {
                r.info(`[diagnostics-example] Delaying action result by 1 second`);
                setTimeout(async () => {
                    await this.sendActionResult(id, true, "Delayed success");
                }, 1000);
                break;
            }

            case "perf/timeout/action_result": {
                r.info(`[diagnostics-example] Not sending action result (will timeout after 5s)`);
                break;
            }

            case "prot/result/error_nomessage": {
                r.info(`[diagnostics-example] Sending error result without message`);
                await this.sendActionResult(id, false, "");
                break;
            }

            case "test_action": {
                r.info(`[diagnostics-example] Normal test action executed`);
                await this.sendActionResult(id, true, "Test action succeeded");
                break;
            }

            default:
                await this.sendActionResult(id, false, `Unhandled action: ${name}`);
        }
    }

    public async runAction(_name: string, _data: any): Promise<ActionResult> {
        return { success: true };
    }

    public async hello() {
        r.info(`[diagnostics-example] Registering ${this.actions.size} actions`);
        super.hello();

        await this.sendContext(
            [
                "Welcome to the Diagnostics Example game.",
                "This game demonstrates various diagnostic conditions.",
                "Execute any action to trigger its corresponding diagnostic.",
                "Click the colored status dot on the game tab to open the diagnostics panel.",
            ].join("\n"),
            true
        );
        await this.registerActions(Array.from(this.actions.values()));
    }
}
