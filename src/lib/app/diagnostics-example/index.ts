import r from "$lib/app/utils/reporting";
import { jsonParse, shortId } from "$lib/app/utils";
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
                await this.sendActionResult(id, true);
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
                await this.sendActionResult(id, true);
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
                await this.sendActionResult(id, true);
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
                await this.sendActionResult(id, true);
                // if awaited, first force would complete before second, so it would not be "multiple at once"
                this.conn.send(msg);
                this.conn.send(msg);
                r.info(`[diagnostics-example] Sent multiple actions/force messages`);
                break;
            }

            case "prot/unregister/unknown": {
                await this.sendActionResult(id, true);
                await this.unregisterActions(["never_registered_action"]);
                r.info(`[diagnostics-example] Unregistered unknown action 'never_registered_action'`);
                break;
            }

            case "prot/unregister/inactive": {
                await this.sendActionResult(id, true);
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

            case "perf/register/identical_duplicate": {
                const action = this.actions.get("test_action")!;
                await this.sendActionResult(id, true);
                await this.registerActions([action]);
                r.info(`[diagnostics-example] Registered identical action twice`);
                break;
            }

            case "prot/v1/register/conflict": {
                const conflictingAction: v1.Action = {
                    name: "test_action",
                    description: "This is a different description",
                    schema: null,
                };
                await this.sendActionResult(id, true);
                await this.registerActions([conflictingAction]);
                r.info(`[diagnostics-example] Registered conflicting action with same name`);
                break;
            }

            case "prot/startup/multiple": {
                const msg: v1.Startup = v1.zStartup.decode({
                    game: this.name,
                });
                await this.sendActionResult(id, true);
                await this.conn.send(msg);
                r.info(`[diagnostics-example] Sent startup message`);
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
                await this.sendActionResult(id, true);
                break;
            }

            case "perf/late/action_result": {
                r.info(`[diagnostics-example] Delaying action result by 1 second`);
                setTimeout(async () => {
                    await this.sendActionResult(id, true);
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
                await this.sendActionResult(id, true);
                break;
            }

            case "prot/invalid_message": {
                await this.sendActionResult(id, true);
                r.info(`[diagnostics-example] Sending invalid WebSocket message`);
                await this.conn.sendRaw(JSON.stringify({ invalid: "message" }));
                break;
            }

            case "prot/v1/game_renamed": {
                const msg: v1.Startup = v1.zStartup.decode({
                    game: "Different Game Name",
                });
                await this.sendActionResult(id, true);
                r.info(`[diagnostics-example] Sent startup with different game name`);
                await this.conn.send(msg);
                break;
            }

            case "prot/result/unexpected": {
                const fakeActionId = shortId();
                await this.sendActionResult(id, true);
                r.info(`[diagnostics-example] Sending result for non-existent action ID: ${fakeActionId}`);
                await this.sendActionResult(fakeActionId, true, "Unexpected result");
                break;
            }

            case "prot/schema/additionalProperties": {
                await this.sendActionResult(id, true);
                r.info(`[diagnostics-example] Registering action with schema missing additionalProperties: false`);
                const badSchemaAction: v1.Action = {
                    name: shortId(),
                    description: "Action with schema missing additionalProperties",
                    schema: {
                        type: "object",
                        properties: {
                            test: { type: "string" },
                        },
                    },
                };
                await this.registerActions([badSchemaAction]);
                await this.unregisterActions([badSchemaAction.name]);
                break;
            }

            case "prot/action/no_desc": {
                await this.sendActionResult(id, true);
                r.info(`[diagnostics-example] Registering action with no description`);
                const barrenAction: v1.Action = { name: shortId() };
                await this.registerActions([barrenAction]);
                await this.unregisterActions([barrenAction.name]);
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
