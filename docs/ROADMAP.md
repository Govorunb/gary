# Project Roadmap

## Current Development

The project is currently undergoing a renovation, porting functionality and UI from Python to Tauri:

- `src/gary/` - Stable Python app. Agents *must* not modify this project.
- `app/` - In-dev Tauri port of the application.
    - `app/src` - Svelte 5 frontend. Almost all development will happen here.
    - `app/src-tauri` - Rust backend. Do not edit unless explicitly asked to.

The immediate goal for the backend is to get at least Randy running and responding to actions.
The frontend goal is to display the game, context, and actions (with sending as the next step).

### Notable changes

The goal of the port is to keep functionality the same; however, some things will change for the sake of simplifying development for game integrations. Internals are sure to change, but the UI may too - in other words, it won't be a complete one-to-one port.

#### Single Context

Previously, each game hosted its own LLM with its own context. In the Tauri app, the context will be decoupled from the LLM, and may be shared between multiple game connections (e.g. two separate integration mods running in the same game).

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
- Launching game processes (proposed Shutdown API)
