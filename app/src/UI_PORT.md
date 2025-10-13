# Gary Tauri UI Port Plan

## Background & Context

- The Python UI (`src/gary/web/ui.py` and related views) hosts a tabbed dashboard per connected game with panels for actions, context log, manual context injection, raw message sending, and advanced toggles.
- The Tauri app already implements server lifecycle controls in the `ServerManager` class (`app/src/lib/app/server.svelte.ts`) and maintains live connections via the `Registry` class in `app/src/lib/api/registry.svelte`.
- Roadmap priorities call for showing each game, visualising context, and facilitating manual actions, with sending actions as the next milestone.
- Svelte 5 (see `docs/svelte5.md`) requires explicit runes (`$state`, `$derived`, `$effect`, `$props`) and avoids legacy `$:` or `export let`; agents implementing the new UI must keep this pattern in mind.

## Goals

- Display server status, connected games, per-game details, and manual controls in a single ergonomic view.
- Preserve functional parity with the Panel UI where practical (actions list, schema-driven forms, context stream, manual context injection, advanced toggles, modals) while modernising UX.
- Structure the codebase so UI logic resides in Svelte components (`app/src/lib/ui/app/`), while protocol handling remains in TypeScript modules (`app/src/lib/api/`, `app/src/lib/app/`).
- Keep in mind future enhancements from the roadmap (`docs/ROADMAP.md`) so they could be implemented without requiring major rewrites.

## Primary User Flows

1. Start a session to the "launch" state, where the user can set backend parameters, start/stop the server, and monitor its status. Once the server is started, transition to the "dashboard" state. The dashboard view itself should show on launch but direct the user to start the server so games can connect.
2. Monitor connected games, inspect their actions, and mute/unmute auto-scheduler (“Tony Mode”).
3. View context history, inject messages, clear context, or inspect the raw text.
4. Trigger manual actions via schema forms or send raw WebSocket payloads through a JSON editor.
5. Adjust UI preferences and behavioural toggles (enforce schema) per game.

## High-Level Layout

The app will start to the "launch" state, showing server controls and letting the user start the server.

When the server is started, the app will transition to the main dashboard state. Server controls will remain accessible in the header (power button).

The main dashboard layout will render on a single page in a **Sidebar Split Layout**:
- Left sidebar for a tabbed control panel, with:
  - A pinned tab for app behaviour controls (e.g. scheduler settings)
  - Individual tabs for each connected game that lists actions (closing the tab disconnects the game)
- A central column for displaying the active context, featuring:
  - A scrolling log of marked up display messages
  - A text input for manually inserting user messages into the context
  - Buttons to clear the context, view a raw JSON dump of it, and so on
- A right sidebar for advanced tools or per-game settings.

On smaller widths, the right sidebar will merge into the left sidebar as a collapsible panel, leaving a two-column layout with actions on the left and context on the right.

A **Modal Layer** will be present to replicate previous Panel modal behaviour.

## Note (important)

This document is less of an instruction and more of a general direction.
The UI port is currently underway, and may in places deviate from this document. Always check how things are currently implemented and prefer building on top of rather than over the current state.
