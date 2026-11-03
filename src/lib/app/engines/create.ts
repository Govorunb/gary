import type { EventBus } from "../events/bus";
import type { EnginePrefs } from "./index.svelte";
import { OpenAIEngine } from "./llm/openai.svelte";
import { OpenRouter, ENGINE_ID as OPENROUTER_ID } from "./llm/openrouter.svelte";
import { Randy, ENGINE_ID as RANDY_ID } from "./randy.svelte";

export function createEngine(prefs: EnginePrefs, id: string, bus?: EventBus) {
    switch (id) {
        case RANDY_ID: return new Randy(prefs, bus);
        case OPENROUTER_ID: return new OpenRouter(prefs, bus);
        default: return new OpenAIEngine(prefs, id, bus);
    }
}
