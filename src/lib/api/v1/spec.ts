import { v4 as uuid4 } from "uuid";
import * as z from 'zod';
import { zConst } from "$lib/app/utils";

export const zAction = z.strictObject({
    name: z.string().nonempty(),
    description: z.string().optional(),
    schema: z.record(z.string(), z.any()).nullable(),
});

export type Action = z.infer<typeof zAction>;

export const zGameMessageBase = z.strictObject({
    game: z.string().nonempty(),
    // *technically* an error to include this in dataless messages, but we ball
    // (e.g. Abandoned Pub sends `startup` with `data: {}`)
    data: z.object().nullish(),
});

export const zStartup = z.strictObject({
    ...zGameMessageBase.shape,
    command: zConst("startup"),
});

export const zContext = z.strictObject({
    ...zGameMessageBase.shape,
    command: zConst("context"),
    data: z.strictObject({
        message: z.string(),
        silent: z.boolean(),
    }),
});

export const zRegisterActions = z.strictObject({
    ...zGameMessageBase.shape,
    command: zConst("actions/register"),
    data: z.strictObject({
        actions: z.array(zAction),
    }),
});

export const zUnregisterActions = z.strictObject({
    ...zGameMessageBase.shape,
    command: zConst("actions/unregister"),
    data: z.strictObject({
        action_names: z.array(z.string()),
    }),
});

export const zForceAction = z.strictObject({
    ...zGameMessageBase.shape,
    command: zConst("actions/force"),
    data: z.strictObject({
        state: z.string().optional(),
        query: z.string(),
        ephemeral_context: z.boolean().default(false),
        action_names: z.array(z.string()),
        priority: z.enum(["low", "medium", "high", "critical"]).fallback("low"), // TODO: interrupt llm gen (when we start streaming responses)
    }),
});

export const zActionResult = z.strictObject({
    ...zGameMessageBase.shape,
    command: zConst("action/result"),
    data: z.strictObject({
        id: z.string(),
        success: z.boolean(),
        message: z.string().optional(),
    }),
});

export const zShutdownReady = z.strictObject({
    ...zGameMessageBase.shape,
    command: zConst("shutdown/ready"),
});

export const zGameMessage = z.discriminatedUnion("command", [
    zStartup,
    zContext,
    zRegisterActions,
    zUnregisterActions,
    zForceAction,
    zActionResult,
    zShutdownReady,
]);

export type Startup = z.infer<typeof zStartup>;
export type Context = z.infer<typeof zContext>;
export type RegisterActions = z.infer<typeof zRegisterActions>;
export type UnregisterActions = z.infer<typeof zUnregisterActions>;
export type ForceAction = z.infer<typeof zForceAction>;
export type ActionResult = z.infer<typeof zActionResult>;
export type ShutdownReady = z.infer<typeof zShutdownReady>;

export type GameMessage = z.infer<typeof zGameMessage>;

// Neuro messages

export const zActData = z.strictObject({
    id: z.string().default(uuid4),
    name: z.string().nonempty(),
    data: z.string().nullish(),
});
export const zAct = z.strictObject({
    command: zConst("action"),
    data: zActData,
});

export const zReregisterAll = z.strictObject({
    command: zConst("actions/reregister_all"),
})

export const zNeuroMessage = z.discriminatedUnion("command", [
    zAct,
    zReregisterAll,
])

export type Act = z.infer<typeof zAct>;
export type ActData = z.infer<typeof zActData>;
export type ReregisterAll = z.infer<typeof zReregisterAll>;
export type NeuroMessage = z.infer<typeof zNeuroMessage>;
