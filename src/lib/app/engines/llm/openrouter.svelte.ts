import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { ConfigError, LLMEngine, zLLMOptions, type OpenAIContext } from "./index.svelte";
import { zActorSource, zMessage, type Message } from "$lib/app/context.svelte";
import r from "$lib/app/utils/reporting";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import z from "zod";
import { err, errAsync, ok, ResultAsync, type Result } from "neverthrow";
import { EngineError, type EngineAct } from "../index.svelte";
import type { Action } from "$lib/api/v1/spec";
import { OpenAI } from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/index.mjs";

export const ENGINE_ID = "openRouter";

export class OpenRouter extends LLMEngine<OpenRouterPrefs> {
    readonly name: string = "OpenRouter";
    private client: OpenAI;

    constructor(userPrefs: UserPrefs) {
        super(userPrefs, ENGINE_ID);
        this.client = new OpenAI({
            apiKey: this.options.apiKey ?? "-",
            dangerouslyAllowBrowser: true,
            baseURL: "https://openrouter.ai/api/v1/",
        });
    }

    generateStructuredOutput(context: OpenAIContext, outputSchema?: JSONSchema): ResultAsync<Message, EngineError> {
        if (!this.options.apiKey) {
            return errAsync(new ConfigError("OpenRouter API key is required"));
        }
        return new ResultAsync(this.genJson(context, outputSchema));
    }
    generateToolCall(context: OpenAIContext, actions: Action[]): ResultAsync<EngineAct | null, EngineError> {
        return errAsync(new EngineError("Tool calling not implemented", undefined, false));
    }

    async genJson(context: OpenAIContext, outputSchema?: JSONSchema): Promise<Result<Message, EngineError>> {
        this.client.apiKey = this.options.apiKey;

        const params: ChatCompletionCreateParamsNonStreaming = {
            messages: context,
            model: this.options.model ?? "openrouter/auto",
            // @ts-expect-error
            reasoning: { effort: "none" }, // ignored by provider. whatever
            // debug: { echo_upstream_body: true },
            structured_outputs: true,
            // some providers require reasoning (dude why)
            // provider: { require_parameters: true },
        };

        if (outputSchema) {
            params.response_format = {
                type: "json_schema",
                json_schema: {
                    name: "gary_action",
                    schema: outputSchema as Record<string, unknown>,
                    strict: true,
                },
            };
        }

        console.warn("Full request params:", params);
        const res = await ResultAsync.fromPromise(this.client.chat.completions.create(params), x => x as Error);
        console.log("Response:", res);
        if (res.isErr()) {
            r.error("OpenRouter chat.completions.create failed", {
                toast: false,
                ctx: {err: res.error}
            });
            return err(new EngineError("Failed to generate", res.error, false));
        }

        const response = res.value;
        const resp = response.choices[0];
        if (resp.finish_reason !== "stop" && resp.finish_reason !== "length") {
            return err(new EngineError(`Unexpected finish_reason ${resp.finish_reason}`, undefined, false))
        }
        const textOutput = resp.message.content;
        const reasoning = (resp.message as any).reasoning;

        if (!textOutput) {
            return err(new EngineError(`Empty response`));
        }

        const msg = zMessage.decode({
            text: textOutput,
            source: zActorSource.decode({manual: false}),
            silent: true,
            customData: {
                [this.id]: { response, reasoning },
            },
        });
        return ok(msg);
    }

    static async testApiKey(apiKey: string): Promise<Result<void, EngineError>> {
        if (!apiKey) {
            return err(new EngineError("API key is required", undefined, false));
        }

        const res = await ResultAsync.fromPromise(fetch("https://openrouter.ai/api/v1/key", {
            headers: { Authorization: `Bearer ${apiKey}` }
        }), x => x as Error);
        if (!res.isOk()) {
            return err(new EngineError("Invalid API key", res.error, false));
        }

        return ok();
    }
}

export const zOpenRouterPrefs = z.strictObject({
    ...zLLMOptions.shape,
    apiKey: z.string().default(""),
    /** OpenRouter model identifier.
     * Can be:
     * - Empty or "openrouter/auto" for auto routing
     * - A model slug ("gpt-5")
     * - A preset slug ("@preset/my-precious")
     * - Variants (":nitro", ":free") are supported as normal
     * See [OpenRouter docs](https://openrouter.ai/docs/features/model-routing) for more info.
     * */
    model: z.string().optional(),
});

export type OpenRouterPrefs = z.infer<typeof zOpenRouterPrefs>;
