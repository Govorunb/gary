# Project Roadmap

## Current Development

The project is currently undergoing a renovation, porting functionality and UI from Python to Tauri:

- `src/gary/` - Stable Python app. Agents *must* not modify this project.
- `app/` - In-dev Tauri port of the application.
    - `app/src` - Svelte 5 frontend. Almost all development will happen here. See `app/src/UI_PORT.md` for the current plan for porting the UI from the Python app.
    - `app/src-tauri` - Rust backend. Do not edit unless explicitly asked to.

The immediate goal for the backend is to get at least Randy running and responding to actions.
The frontend goal is to display the game, context, and actions (with sending as the next step). Track detailed UI milestones in `app/src/UI_PORT.md`.

### Notable changes

The goal of the port is to keep functionality the same; however, some things will change for the sake of simplifying development for game integrations. Internals are sure to change, but the UI may too - in other words, it won't be a complete one-to-one port.

#### Single Context

Previously, each game hosted its own LLM with its own context. In the Tauri app, there will be one context shared between all game connections (e.g. two separate integration mods running in the same game).

#### Context enhancements

As mentioned previously, the context will be stored and managed separately from the LLM, as an array of messages enriched with metadata (e.g. timestamp, source of message like "game" or "system", etc). This will require converting the messages to the standard "role-message" format for LLMs.

### Future plans

After the port is complete, the Python app will be deprecated and removed. Then, some long-standing TODOs will finally be addressed:

#### Engine hot-swapping

Previously, the LLM engine was selected on startup and could not be changed. It would be nice if the user was be able to pick the engine at runtime and switch between them as needed (maybe per-context, or per-game).

#### Remote LLM Support

The Tauri app will support OpenAI-compatible remote APIs - specifically, OpenRouter will get direct support, with a generic engine exposed for other services.

#### Miscellaneous wishlist
- Actual config UI (I can't believe this wasn't done already)
- Launching game processes (enabling use of the proposed Shutdown API)
- App logs should also show up in UI as notifications

#### UI Modes/Auto checks

I like the idea of collapsing everything down to just a list of connected games with a small display for any opinionated warnings/advice, to quickly test the behaviour of an integration and confirm it conforms to the spec and acts in an acceptable way.

Same with e.g. accomodating someone testing their SDK implementation vs a game integration - they have different requirements, and it'd be nice to have modes that focus in on each of those workflows.

Previously this was sort of kind of accomodated by allowing different logging levels for each module/"subsystem" (e.g. logging websockets at `trace` to diagnose message passing), but I wonder if that could be taken to the extreme.
