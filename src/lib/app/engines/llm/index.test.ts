import { describe, expect, test } from "vitest";
import { errAsync, okAsync, type ResultAsync } from "neverthrow";
import { ConfigError, LLMEngine, type CommonLLMOptions, type LLMGeneration, type OpenAIContext } from ".";
import type { Action } from "$lib/api/v1/spec";
import type { UserPrefs } from "$lib/app/prefs.svelte";
import type { Session } from "$lib/app/session.svelte";
import { EngineError, type EngineActError, type EngineActResult } from "../index.svelte";
import type { JSONSchema } from "openai/lib/jsonschema";

function llmOptions(options: Partial<CommonLLMOptions> = {}): CommonLLMOptions {
    return {
        allowDoNothing: false,
        allowYapping: false,
        promptingStrategy: "json",
        ...options,
    };
}

function createSession(): Session {
    return {
        registry: { games: [] },
        context: { actorView: [] },
        userPrefs: { app: {} },
    } as unknown as Session;
}

class TestLLMEngine extends LLMEngine<CommonLLMOptions> {
    readonly name = "Test LLM";
    generation = `{"command":"wait"}`;
    contexts: OpenAIContext[] = [];
    outputSchemas: JSONSchema[] = [];

    constructor(options: CommonLLMOptions) {
        super({ engines: { test: options } } as unknown as UserPrefs, "test");
    }

    protected generateStructuredOutput(context: OpenAIContext, outputSchema?: JSONSchema): ResultAsync<LLMGeneration, EngineActError> {
        this.contexts.push(context);
        if (outputSchema) {
            this.outputSchemas.push(outputSchema);
        }
        return okAsync({ text: this.generation } satisfies LLMGeneration);
    }

    protected generateToolCall(_context: OpenAIContext, _actions: Action[]): ResultAsync<EngineActResult, EngineActError> {
        return errAsync(new EngineError("Tool calling not implemented"));
    }
}

describe("LLMEngine no-action acts", () => {
    test("skips without generating when no actions are available", async () => {
        const engine = new TestLLMEngine(llmOptions({ allowDoNothing: true }));

        const result = await engine.tryAct(createSession(), []);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toBe("skip");
        }
        expect(engine.contexts).toHaveLength(0);
        expect(engine.outputSchemas).toHaveLength(0);
    });

    test("allows yapping without actions when configured", async () => {
        const engine = new TestLLMEngine(llmOptions({ allowYapping: true }));
        engine.generation = `{"command":{"say":"hello","notify":true}}`;

        const result = await engine.tryAct(createSession(), []);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({ say: "hello", notify: true });
        }
        expect(engine.outputSchemas).toHaveLength(1);
        const commandAnyOf = (engine.outputSchemas[0].properties?.command as any).anyOf;
        expect(commandAnyOf).toHaveLength(1);
        expect(JSON.stringify(commandAnyOf)).not.toContain('"anyOf":[]');
    });

    test("returns a config error without actions when neither skipping nor yapping is configured", async () => {
        const engine = new TestLLMEngine(llmOptions());

        const result = await engine.tryAct(createSession(), []);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(ConfigError);
            if (result.error instanceof ConfigError) {
                expect(result.error.message).toBe("No actions are available, and this engine is configured to neither skip nor speak");
            }
        }
        expect(engine.contexts).toHaveLength(0);
        expect(engine.outputSchemas).toHaveLength(0);
    });
});
