# Engine Config UI Investigation & Plan

## Current Architecture Summary

### Engine Types & Configuration
1. **Base Engine Class** (`Engine<TOptions>`): Abstract class with typed options
2. **LLM Engines** (`LLMEngine<TOptions>`): Extends base with common LLM options (`allowDoNothing`, `allowYapping`)
3. **Specific Implementations**:
   - **OpenRouter**: Fixed engine with `zOpenRouterPrefs` (apiKey, model, providerSortList, extraModels)
   - **OpenAI-compatible**: Dynamic instances with `zOpenAIPrefs` (name, apiKey, serverUrl, modelId + common LLM options)
   - **Randy**: Simple random engine with `zRandyPrefs` (chanceDoNothing)

### Configuration Storage
- **UserPrefs**: Centralized config store using localStorage
- **Engine configs**: Stored in `userPrefs.engines[engineId]` as typed objects
- **Reactivity**: Options are `$derived` from userPrefs, engines auto-update when prefs change

### Current UI State
- **EnginePicker**: Shows engine list with placeholder config buttons (non-functional)
- **ServerConfig**: Simple example of bound configuration UI
- **No schema-to-form system**: Unlike stable Python app, new Svelte frontend lacks automatic form generation

## Implementation Plan

### 1. Form Generation Approach
**Strategy**: Build primitive field components now, enable auto-generation later
- Create individual field components for primitive types (string, number, boolean, URL, arrays)
- Manually place fields on forms for config UI; keep flexibility for bespoke elements:
  - Tooltip explainers
  - Password masking for API keys
  - "Test connection" buttons for server URLs
- Long-term: Use `z.toJSONSchema()` for automatic form generation (also needed for manual action sending)
- The [Svelte 5 documentation on bindings](https://svelte.dev/docs/svelte/bind.md) may be useful for implementing form field components

### 2. UI Placement & Behavior
**Inspiration**: LMStudio's model selector
**Implementation**:
- Host both "Engine List" and "Engine Config" in the same EnginePicker modal
- Two states: "engine list" and "engine config" (no true browser navigation)
- Navigation:
  - Click config button or Alt+click row → engine config state
  - Back button → engine list state
  - External cog button → opens engine picker in config state for current engine
- Implementation:
  - Create EngineList and EngineConfig components
  - Host both in the same EnginePicker modal
  - Use a state variable to track whether there is an engine selected, doubling as navigation state (not selected = engine list, selected = engine config)
- Sorting in engine list - "last used" recency sort (non-configurable)
  - Requires adding timestamps to **app** prefs (not engine prefs!) to sort by
  - A newly created engine is automatically given a "last used" timestamp of "now", making it start at the top of the list

### 3. Engine Management Features
**Required**:
- Hidden behind an "advanced mode" toggle:
  - Ability to delete currently selected OpenAI-compatible engine (including default Ollama/LMStudio)
  - JSON editor for quick export/import (copy/paste) and full engine configuration
    - Validation - either JSON Schema or Zod schema
    - (Optional) Syntax highlighting with `shiki`

**Not needed**:
- Manual reordering (consistent sorting obviates this)
- Duplicate engine function (JSON import covers this)

### 4. Validation Strategy
**Two-layer approach**:
1. **HTML5 validation** on individual fields (built-in browser validation)
2. **Zod validation** on form submission
**Implementation**:
- Bind fields to temporary "dirty" copy of config
- Block save button (and writing to actual UserPrefs) if either validation layer fails
- Show error messages for failed validation

### 5. Real-time Updates
- Engine behavior updates immediately on save
- No engine restart required unless forced by future constraints
- Existing Svelte 5 reactivity system handles this

## Technical Implementation Details

### Schema Form Generation
- Each engine exposes Zod schema (`zOpenAIPrefs`, `zOpenRouterPrefs`, etc.)
- Use `z.toJSONSchema()` for schema information; generate form from JSON schema rather than Zod schema
- Field types to support: string, number (int, float), boolean, URL

### Configuration Binding Pattern
```svelte
// Current pattern from ServerConfig
bind:value={userPrefs.server.port}

// Engine pattern (with dirty copy)
bind:value={dirtyConfig.apiKey}
```

### Component Dependencies
```
EnginePicker.svelte (existing)
├── EngineList.svelte (new)
├── EngineConfig.svelte (new)
│   ├── StringField.svelte (new)
│   ├── NumberField.svelte (new)
│   ├── BooleanField.svelte (new)
│   ├── URLField.svelte (new)
│   └── JSONEditor.svelte (new, advanced)
```

### Component File Structure
```
/app/src/lib/ui/
├── app/
│   ├── EnginePicker.svelte (existing)
│   ├── EngineList.svelte (new)
│   └── EngineConfig.svelte (new)
├── common/form/
│   ├── StringField.svelte (new)
│   ├── NumberField.svelte (new)
│   ├── BooleanField.svelte (new)
│   ├── URLField.svelte (new)
│   └── JSONEditor.svelte (new, advanced)
```

### State Management
- Add `selectedEngineId: string | null` to EnginePicker
- Derive state machine state from selected engine, e.g.: `let configState: 'list' | 'config' = $derived(selectedEngineId != null ? 'config' : 'list');`
- Create dirty copy mechanism for safe editing

## Next Steps
1. Add navigation state machine to EnginePicker
2. Create primitive field components
3. Implement EngineConfig component with manual field placement
4. Add validation to config form
5. Add "advanced mode" toggle with delete button
6. (Optional) Add JSON editor (advanced mode)
