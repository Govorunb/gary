import type OpenAI from "openai";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { Response, ResponseCreateParamsNonStreaming, ResponseInputItem } from "openai/resources/responses/responses";

/** OpenAI's newer models refuse parts of what we send to `chat/completions` (function tools together with
 * a reasoning effort, `max_tokens`), so the same request can go through the Responses API instead.
 * It's opt-in per engine: other servers' `responses` support is too patchy to assume (see OpenAIClient). */

function textOf(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content.map(part => (part as { text?: string }).text ?? "").join("\n");
}

export function toResponsesParams(chat: ChatCompletionCreateParamsNonStreaming): ResponseCreateParamsNonStreaming {
    const instructions: string[] = [];
    const input: ResponseInputItem[] = [];
    for (const message of chat.messages) {
        if (message.role === "system" || message.role === "developer") {
            instructions.push(textOf(message.content));
        } else if (message.role === "tool") {
            input.push({ type: "function_call_output", call_id: message.tool_call_id, output: textOf(message.content) });
        } else if (message.role === "user" || message.role === "assistant") {
            const text = textOf(message.content);
            if (text) input.push({ role: message.role, content: text });
            for (const call of (message.role === "assistant" && message.tool_calls) || []) {
                if (call.type !== "function") continue;
                input.push({ type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments });
            }
        }
    }

    const format = chat.response_format;
    const toolChoice = chat.tool_choice;
    return {
        model: chat.model,
        input,
        store: false,
        stream: false,
        ...(instructions.length ? { instructions: instructions.join("\n\n") } : {}),
        ...(chat.tools ? {
            // not strict: action schemas have optional fields, which strict mode refuses
            tools: chat.tools.filter(tool => tool.type === "function").map(tool => ({
                type: "function" as const,
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters ?? { type: "object", properties: {} },
                strict: false,
            })),
            parallel_tool_calls: chat.parallel_tool_calls ?? undefined,
        } : {}),
        ...(typeof toolChoice === "string" ? { tool_choice: toolChoice }
            : toolChoice?.type === "function" ? { tool_choice: { type: "function" as const, name: toolChoice.function.name } }
            : {}),
        ...(format?.type === "json_schema" ? {
            text: { format: { type: "json_schema" as const, name: format.json_schema.name, schema: format.json_schema.schema ?? {}, strict: false } },
        } : {}),
        // the summary is the only view of the model's reasoning that OpenAI gives out
        ...(chat.reasoning_effort ? {
            reasoning: { effort: chat.reasoning_effort, ...(chat.reasoning_effort === "none" ? {} : { summary: "auto" as const }) },
        } : {}),
        ...(chat.max_tokens ? { max_output_tokens: chat.max_tokens } : {}),
    };
}

export function toChatCompletion(response: Response): ChatCompletion {
    // OpenAIClient already copes with an error object where a completion should be
    if (response.error) return { error: response.error } as unknown as ChatCompletion;

    let content = "";
    const reasoning: string[] = [];
    const toolCalls: ChatCompletion.Choice["message"]["tool_calls"] = [];
    for (const item of response.output) {
        if (item.type === "message") {
            for (const part of item.content) {
                if (part.type === "output_text") content += part.text;
            }
        } else if (item.type === "reasoning") {
            reasoning.push(...item.summary.map(part => part.text));
        } else if (item.type === "function_call") {
            toolCalls.push({ id: item.call_id, type: "function", function: { name: item.name, arguments: item.arguments } });
        }
    }
    const usage = response.usage;
    return {
        id: response.id,
        object: "chat.completion",
        created: response.created_at,
        model: response.model,
        choices: [{
            index: 0,
            logprobs: null,
            finish_reason: toolCalls.length ? "tool_calls" : response.status === "incomplete" ? "length" : "stop",
            message: {
                role: "assistant",
                content: content || null,
                refusal: null,
                ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
                // not part of a chat completion, but where OpenAIClient looks for it (as OpenRouter sends it)
                ...(reasoning.length ? { reasoning: reasoning.join("\n\n") } : {}),
            },
        }],
        ...(usage ? {
            usage: { prompt_tokens: usage.input_tokens, completion_tokens: usage.output_tokens, total_tokens: usage.total_tokens },
        } : {}),
    };
}

export async function createViaResponses(
    client: OpenAI,
    params: ChatCompletionCreateParamsNonStreaming,
    options: { signal?: AbortSignal },
) {
    return toChatCompletion(await client.responses.create(toResponsesParams(params), options));
}
