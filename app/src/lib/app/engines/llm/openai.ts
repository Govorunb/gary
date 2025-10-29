import type { JSONSchema } from "openai/lib/jsonschema.mjs";
import { LLMEngine, type CommonLLMOptions, type OpenAIContext } from ".";
import { zActorSource, zMessage, type Message } from "$lib/app/context.svelte";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import OpenAI from "openai";
import type { ClientOptions } from "openai";
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import * as log from "@tauri-apps/plugin-log";
import { toast } from "svelte-sonner";

export interface Options extends CommonLLMOptions {
    apiKey?: string;
    serverUrl: string;
    modelId?: string;
    organization?: string;
    project?: string;
}

export class OpenAIEngine extends LLMEngine<Options> {

    constructor(userPrefs: UserPrefs, engineId: string, public readonly name: string) {
        super(userPrefs, engineId);
    }

    private createClient() {
        const config: ClientOptions = {
            apiKey: this.options.apiKey,
            baseURL: this.options.serverUrl,
            organization: this.options.organization,
            project: this.options.project,
        };
        return new OpenAI(config);
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

        const client = this.createClient();

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
            const res = await client.chat.completions.create(params);
            const choice = res.choices[0];
            const content = choice?.message?.content;
            if (!content) {
                throw new Error("No content returned from OpenAI");
            }

            const msg = zMessage.decode({
                text: typeof content === "string" ? content : String(content),
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
