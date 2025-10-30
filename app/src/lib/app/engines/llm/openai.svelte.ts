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
 * This engine type may have multiple instances active at once, each with a generated ID and a user-defined name.
 */
export class OpenAIEngine extends LLMEngine<OpenAIPrefs> {
    readonly name: string;
    private readonly client: OpenAI;

    constructor(userPrefs: UserPrefs, engineId: string) {
        super(userPrefs, engineId);
        this.name = $derived(this.options.name);
        
        this.client = new OpenAI({
            apiKey: async () => this.options.apiKey, // FIXME: it thinks empty strings aren't strings smh
            baseURL: this.options.serverUrl,
            dangerouslyAllowBrowser: true, // we have to...
        } satisfies ClientOptions);
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
        // ooga booga me no have reactivity because can be instantiate at runtime, outside root effect
        // so me use pull model instead of push model. hoh
        // i just know seniorberry shake head and wag finger from inside cloud, but i the one that feel alive
        this.client.baseURL = this.options.serverUrl;

        try {
            // after evaluating tools/responses api - it all sucks bad
            // ollama still doesn't support it, nor `tool_choice`
            // lmstudio has responses (allegedly stateful) but doesn't support `strict` in tool definitions (ouch)
            // it also doesn't seem to constrain generation with `text.format` at all?
            // so... `response_format` on `chat/completions` it is
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

// TODO: generation params (temperature, etc)
// however: https://platform.openai.com/docs/guides/latest-model#gpt-5-parameter-compatibility
// gpt5 xor temperature/top_p/logprobs
export const zOpenAIPrefs = z.looseObject({
    name: z.string(),
    ...zLLMOptions.shape,
    /** Leave empty if your server doesn't need authentication. (e.g. local) */
    apiKey: z.string().default(""),
    serverUrl: z.url().default("https://api.openai.com/v1"),
    modelId: z.string().optional(),
});

export type OpenAIPrefs = z.infer<typeof zOpenAIPrefs>;
