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

1. Start a session to the "launch" page, where the user can set backend parameters, start/stop the server, and monitor its status. Once the server is started, transition to the "dashboard" view.
2. Monitor connected games, inspect their actions, and mute/unmute scheduler (“Tony Mode”).
3. View context history, inject messages, clear context, or inspect the raw text.
4. Trigger manual actions via schema forms or send raw WebSocket payloads through a JSON editor.
5. Adjust UI preferences and behavioural toggles (enforce schema) per game.

## High-Level Layout

The app will start to the "launch" screen, showing server controls.

When the server is started, the app will transition to the main dashboard layout, moving server controls into a tab.

The main dashboard layout will render on a single page in a **Sidebar Split Layout**:
- Left sidebar for a tabbed control panel, with:
  - A pinned, uncloseable 'server controls' tab
  - Individual tabs for each connected game that lists actions (closing the tab disconnects the game)
- A central column for displaying the active context, featuring:
  - A scrolling log of marked up display messages
  - A text input for manually inserting user messages into the context
  - Buttons to clear the context, view a raw JSON dump of it, and so on
- A right sidebar for advanced tools or per-game settings.

On smaller widths, the right sidebar will merge into the left sidebar as a collapsible panel, leaving a two-column layout with actions on the left and context on the right.

There will also be a **Modal Layer** to replicate previous Panel modal behaviour.
