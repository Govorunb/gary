import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { LLMEngine, zLLMOptions, type CommonLLMOptions, type OpenAIContext } from ".";
import { zActorSource, zMessage, type Message } from "$lib/app/context.svelte";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import OpenAI from "openai";
import type { ClientOptions } from "openai";
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import * as log from "@tauri-apps/plugin-log";
import { toast } from "svelte-sonner";
import z from "zod";

/** Generic engine for OpenAI-compatible servers (e.g. Ollama/LMStudio) instantiated from user-created profiles.
 * This engine may have multiple instances active at once, each with a generated ID and a user-defined name.
 */
export class OpenAIEngine extends LLMEngine<OpenAIPrefs> {
    readonly name: string;
    readonly id: string;
    private readonly client: OpenAI;

    constructor(userPrefs: UserPrefs, engineId: string) {
        super(userPrefs, engineId);
        this.id = engineId;
        this.name = $derived(this.options.name);
        this.client = new OpenAI({
            apiKey: this.options.apiKey,
            baseURL: this.options.serverUrl,
        } satisfies ClientOptions);
        $effect(() => {
            // TODO: test reactivity
            this.client.apiKey = this.options.apiKey!;
            this.client.baseURL = this.options.serverUrl;
        })
    }

    private toChatMessages(context: OpenAIContext): ChatCompletionMessageParam[] {
        // the only mismatch is missing "tool_call_id" on "role": "tool"; we will not have those
        return context as ChatCompletionMessageParam[];
    }

    async generate(context: OpenAIContext, outputSchema?: JSONSchema): Promise<Message> {
        const model = this.options.modelId;
        if (!model) {
            throw new Error("OpenAI engine is missing a model ID");
        }

        const messages = this.toChatMessages(context);
        const params: ChatCompletionCreateParamsNonStreaming = {
            model,
            messages,
        };

        if (outputSchema) {
            params.response_format = {
                type: "json_schema",
                json_schema: {
                    name: "gary_action",
                    description: "Structured response matching the requested action schema.",
                    schema: outputSchema as Record<string, unknown>,
                    strict: true,
                },
            };
        }

        try {
            const res = await this.client.chat.completions.create(params);

            const msg = zMessage.decode({
                text: res.choices[0].message.content!, // TODO: error handling
                source: zActorSource.decode({ manual: false }),
                silent: true,
                customData: {
                    [this.name]: { response: res },
                },
            });
            return msg;
        } catch (error) {
            const description = error instanceof Error ? error.message : `${error}`;
            log.error(`OpenAI request failed: ${description}`);
            toast.error("OpenAI request failed", { description });
            throw error;
        }
    }
}

export const zOpenAIPrefs = zLLMOptions.extend({
    name: z.string(),
    /** Leave empty if your server doesn't need authentication. (e.g. local) */
    apiKey: z.string().default(""),
    serverUrl: z.url().default("https://api.openai.com/v1"),
    modelId: z.string().optional(),
});

export type OpenAIPrefs = z.infer<typeof zOpenAIPrefs>;
