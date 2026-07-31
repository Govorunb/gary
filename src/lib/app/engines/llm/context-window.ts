import type { LLMRequest } from ".";

export type ContextBudget = {
    contextWindow: number;
    source: "override" | "provider";
    model: string;
};

export type ContextDiagnostics = ContextBudget & {
    completionReserve: number;
    promptBudget: number;
    estimatedPromptTokensBefore: number;
    estimatedPromptTokens: number;
    removedHistoryUnits: number;
    reportedPromptTokens?: number;
};

export const INITIAL_TOKENS_PER_BYTE = 0.5;
export const MIN_CALIBRATED_TOKENS_PER_BYTE = 0.4;
export const TOKEN_ESTIMATE_MARGIN = 1.1;

export function completionReserve(contextWindow: number): number {
    return Math.min(4096, Math.max(512, Math.floor(contextWindow / 4)));
}

export function requestByteLength(request: LLMRequest): number {
    const json = JSON.stringify({
        messages: request.messages,
        tools: request.tools,
        toolChoice: request.toolChoice,
        responseSchema: request.responseSchema,
    });
    return new TextEncoder().encode(json).byteLength;
}

export function estimateRequestTokens(request: LLMRequest, tokensPerByte: number): number {
    return Math.ceil(requestByteLength(request) * tokensPerByte * TOKEN_ESTIMATE_MARGIN);
}

export function reportedPromptTokens(usage: unknown): number | undefined {
    const value = (usage as { prompt_tokens?: unknown } | null)?.prompt_tokens;
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : undefined;
}
