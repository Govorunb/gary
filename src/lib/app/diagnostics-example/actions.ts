import type * as v1 from "$lib/api/v1/spec";

export const DIAGNOSTIC_ACTIONS: v1.Action[] = [
    {
        name: "prot/force/empty",
        description: "Send actions/force with an empty action list (ERROR)",
        schema: null,
    },
    {
        name: "prot/force/some_invalid",
        description: "Send actions/force where some actions are not registered (WARNING)",
        schema: null,
    },
    {
        name: "prot/force/all_invalid",
        description: "Send actions/force where all actions are unregistered (ERROR)",
        schema: null,
    },
    {
        name: "prot/force/multiple",
        description: "Send three actions/force messages in quick succession (ERROR)",
        schema: null,
    },
    {
        name: "prot/unregister/unknown",
        description: "Unregister an action that was never registered (WARNING)",
        schema: null,
    },
    {
        name: "prot/unregister/inactive",
        description: "Unregister an action that's already unregistered (INFO)",
        schema: null,
    },
    {
        name: "perf/register/identical_duplicate",
        description: "Re-register an identical action (INFO)",
        schema: null,
    },
    {
        name: "prot/v1/register/conflict",
        description: "Register an action with the same name but different definition (WARNING)",
        schema: null,
    },
    {
        name: "prot/startup/multiple",
        description: "Send multiple startup messages (WARNING)",
        schema: null,
    },
    {
        name: "perf/late/action_result",
        description: "Delay action result by 1 second (WARNING)",
        schema: null,
    },
    {
        name: "perf/timeout/action_result",
        description: "Never send action result (ERROR, will timeout after 5s)",
        schema: null,
    },
    {
        name: "prot/result/error_nomessage",
        description: "Send unsuccessful result without message (WARNING)",
        schema: null,
    },
    {
        name: "prot/force/while_pending_result",
        description: "Send actions/force while another force action result is pending (ERROR)",
        schema: null,
    },
    {
        name: "test_action",
        description: "A normal test action that always succeeds",
        schema: null,
    },
    {
        name: "prot/invalid_message",
        description: "Send an invalid WebSocket message (ERROR)",
        schema: null,
    },
    {
        name: "prot/v1/game_renamed",
        description: "Send a startup message with a different game name (WARNING)",
        schema: null,
    },
    {
        name: "prot/result/unexpected",
        description: "Send an action result for a non-existent action ID (WARNING)",
        schema: null,
    },
    {
        name: "prot/schema/additionalProperties",
        description: "Register an action with a schema missing additionalProperties: false (WARNING)",
        schema: null,
    },
];

export const DIAGNOSTIC_ACTIONS_MAP = new Map(
    DIAGNOSTIC_ACTIONS.map(action => [action.name, action])
);
