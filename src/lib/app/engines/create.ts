import type { EventBus } from "../events/bus";
import type { EnginePrefs } from "./index.svelte";
import { OpenAIEngine, zOpenAIPrefs } from "./llm/openai.svelte";
import { OpenRouter, zOpenRouterPrefs, ENGINE_ID as OPENROUTER_ID } from "./llm/openrouter.svelte";
import { Randy, zRandyPrefs, ENGINE_ID as RANDY_ID } from "./randy.svelte";

export function createEngine(prefs: EnginePrefs, id: string, bus?: EventBus) {
    switch (id) {
        case RANDY_ID: return new Randy(prefs, bus);
        case OPENROUTER_ID: return new OpenRouter(prefs, bus);
        default: return new OpenAIEngine(prefs, id, bus);
    }
}

export function engineSettingsSchema(id: string) {
    return id === RANDY_ID ? zRandyPrefs : id === OPENROUTER_ID ? zOpenRouterPrefs : zOpenAIPrefs;
}
