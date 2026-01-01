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
        description: "Send two actions/force messages in quick succession (ERROR)",
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
        name: "prot/v1/register/conflict",
        description: "Register the same action twice (WARNING)",
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
        name: "test_action",
        description: "A normal test action that always succeeds",
        schema: null,
    },
];

export const DIAGNOSTIC_ACTIONS_MAP = new Map(
    DIAGNOSTIC_ACTIONS.map(action => [action.name, action])
);
