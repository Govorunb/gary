# Gary Tauri UI Port Plan

## Purpose & Scope

- Clarify the reimplementation strategy for the Python `panel` UI (under `src/gary/web/`) inside the Tauri/Svelte 5 application located at `app/`.
- Define UI structure, state flows, component responsibilities, and integration touchpoints so implementation can proceed incrementally while matching the roadmap goals.
- Highlight risks, non-goals, and sequencing to keep the port aligned with ongoing backend/Tauri work.

## Background & Context

- The Python UI (`src/gary/web/ui.py` and related views) hosts a tabbed dashboard per connected game with panels for actions, context log, manual context injection, raw message sending, and advanced toggles.
- The Tauri app already implements server lifecycle controls in `app/src/routes/+page.svelte` and maintains live connections via the `Registry` class in `app/src/lib/api/registry.svelte`.
- Roadmap priorities call for showing each game, visualising context, and facilitating manual actions, with sending actions as the next milestone.
- Svelte 5 (see `docs/svelte5.md`) requires explicit runes (`$state`, `$derived`, `$effect`, `$props`) and avoids legacy `$:` or `export let`; agents implementing the new UI must embrace this pattern.

## Goals & Non-Goals

- Deliver an information architecture that surfaces server status, connection list, per-game details, and manual controls in a single desktop-friendly shell.
- Preserve functional parity with the Panel UI where practical (actions list, schema-driven forms, context stream, manual context injection, advanced toggles, modals) while modernising UX.
- Structure the codebase so UI logic resides in Svelte components, while protocol handling remains in TypeScript modules (`app/src/lib/api/`, `app/src/lib/app/`).
- Support future enhancements from the roadmap (shared context, engine hot-swapping, config UI) without major rewrites.
- Non-goals: redesigning backend protocol, implementing LLM generation features, or adding remote-service management—the focus is the UI layer.

## Primary User Flows

1. Start a session to the "launch" page, where the user can set backend parameters, start/stop the server, and monitor its status.
2. Monitor connected games, inspect their actions, and mute/unmute scheduler (“Tony Mode”).
3. View context history, inject messages, clear context, or inspect the raw text.
4. Trigger manual actions via schema forms or send raw WebSocket payloads through a JSON editor.
5. Adjust UI preferences and behavioural toggles (enforce schema) per game.

## High-Level Layout

The layout will render on a single page in a **Sidebar Split Layout**:
- Left sidebar for a tabbed control panel, with:
  - A pinned 'server controls' tab
  - Individual tabs for each connected game that lists actions
- A central column for displaying the active context, featuring:
  - A scrolling log of marked up display messages
  - A text input for manually inserting user messages into the context
  - Buttons to clear the context, view a raw JSON dump of it, and so on
- A right sidebar for advanced tools or per-game settings.

On smaller widths, the right sidebar will merge into the left sidebar as a collapsible panel, leaving a two-column layout with actions on the left and context on the right.

There will also be a **Modal Layer** to replicate previous Panel modal behaviour.

## Component & Module Plan

- **ServerControlPanel (`app/src/lib/ui/ServerControlPanel.svelte`)**
  - Starts/stops server via Tauri `invoke`, shows port input, persists settings (localStorage initially, later via `@tauri-apps/plugin-store`).
  - Emits events/stores updates consumed by the registry and dashboard.
- **ConnectionList (`app/src/lib/ui/ConnectionList.svelte`)**
  - Lists active `Game` entries from the `Registry`, with status badges, version tags, and disconnect actions.
  - Highlights selected game and triggers selection state updates.
- **GameDashboard (`app/src/lib/ui/GameDashboard.svelte`)**
  - Consumes the selected `Game` and renders sub-panels (actions, context, advanced) using a flexible grid.
  - Handles scheduler mute toggle, schema enforcement toggle, and ensures updates propagate to the backend via `Registry` helpers.
- **ActionsPanel (`app/src/lib/ui/actions/ActionsPanel.svelte`)**
  - Displays registered actions using collapsible cards similar to `ActionView`. Integrates schema-driven forms and “Random” generator button.
  - Reuses or ports schema form logic into TypeScript/Svelte modules (`app/src/lib/ui/forms/`).
- **ActionSchemaForm (`app/src/lib/ui/forms/ActionSchemaForm.svelte`)**
  - Ports the dynamic JSON-schema-to-form logic currently implemented in `src/gary/web/views/schema_form/`. Consider `zod-to-form` or bespoke solution using existing schema traversal utilities.
- **RawMessageModal (`app/src/lib/ui/actions/RawMessageModal.svelte`)**
  - Provides code editor (Monaco or CodeMirror via Svelte component) with template selector derived from message schema metadata (`AnyNeuroMessage`).
- **ContextPanel (`app/src/lib/ui/context/ContextPanel.svelte`)**
  - Streams context entries, supports “Say” input, clear context, and show-dump modal. Leverages existing `context.svelte.ts` helpers for formatting.
- **ContextDumpModal (`app/src/lib/ui/context/ContextDumpModal.svelte`)**
  - Fetches full context via `game.llm.dump()` equivalent API exposed through IPC.
- **AdvancedPanel (`app/src/lib/ui/AdvancedPanel.svelte`)**
  - Hosts layout preference controls (drag/resize toggles), schema enforcement switch, and general debugging messaging.
- **ModalHost (`app/src/lib/ui/ModalHost.svelte`)**
  - Centralizes modals; uses a store to push/pop modal content to avoid multiple overlapping modals (limitation observed in Panel).
- **Shared Utilities**
  - `app/src/lib/app/uiState.ts`: central store for UI preferences, selected game ID, and modal stack.
  - `app/src/lib/ui/primitives`: tooltip, badge, status indicator, etc., to avoid duplication.

## State Management Strategy

- Use Svelte 5 runes-based state internally to components; share cross-component state via dedicated stores or classes.
- Promote `Registry` to a singleton store (wrapping existing class instance) exposed through `$state` references to maintain reactivity.
- Introduce derived stores for selected game, mute state, and schema enforcement tied to backend values.
- Persist user preferences (layout options, last selected game, theme) through localStorage initially; integrate Tauri Store once stable.
- Ensure asynchronous updates (WebSocket events, command responses) update stores via typed dispatcher functions to avoid stale UI.

## Theming, Layout, and Accessibility

- Leverage `ThemePicker.svelte` for light/dark modes; ensure new components subscribe to theme variables via CSS custom properties.
- Implement a responsive grid (CSS Grid/Flex) that mimics Panel’s resizable layout but with consistent breakpoints and focus management.
- Provide keyboard navigation, ARIA roles for buttons/toggles, and high-contrast status indicators to improve accessibility beyond the Panel baseline.
- Replace ad-hoc tooltips with the existing `Tooltip.svelte` component to ensure consistent behaviour.

## Implementation Phases

1. **Foundation**: Refactor `+page.svelte` into shell + server controls + registry list; establish shared stores and selection state.
2. **Game Details MVP**: Implement `GameDashboard` with ActionsPanel (read-only), ContextPanel (read-only stream), and basic advanced toggles.
3. **Interactivity Parity**: Add manual context input, action execution (manual + random), scheduler mute toggle, schema switch, and modals for raw send/context dump.
4. **Polish & Persistence**: Integrate layout preferences, persistent settings, validation/error states, and accessibility improvements.
5. **Future Enhancements**: Prepare hooks for shared contexts, engine management, and config UI per roadmap once backend support arrives.

## Open Questions

- Should the layout support multiple concurrent game dashboards (multi-column) or keep a single focused view with quick switching?
- How should shared contexts (per roadmap) surface in the UI—within each game tab or as a separate global view?
- Do we need offline/failed connection states surfaced differently (e.g., reconnect prompts, historical logs)?
