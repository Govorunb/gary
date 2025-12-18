# Project Architecture

## Overview

Gary is a project that allows LLMs to interface with controllable client apps ("game integrations"). It implements a backend for the [Neuro-sama SDK](https://github.com/VedalAI/neuro-sdk) to allow developers of game integrations to test them on a system approximating the production one.

Gary consists of two main components:

- **Backend Server** - WebSocket server that acts as the backend layer for game integrations, following a custom protocol (see below)
- **Management Web UI** - Web interface for game management, manual action sending, and context window control

### WebSocket Protocol

Generally, the flow goes as follows:

The **client** (game integration) connects to the **server** (backend).

Then, the following happens until either side disconnects (e.g. the game ends):
1. Client registers **actions** as available to be performed.
    - Actions contain an **action schema** (JSON schema) for **action data**.
2. As things happen in the game, the client sends **context** to the server to inform the **actor**.
3. At some point in time, the **actor** indicates it wants to perform an action and generates action data for it.
4. The server sends the action (with data) to the client, which validates it against the action schema and attempts to execute the action.
5. The client responds with the **action result**, which is also inserted into context as feedback to the actor.
6. The client may **unregister** actions if they are no longer available (e.g. a non-repeatable action was executed).
7. At any point, the client may send a **force action** message with a set of acceptable actions and additional information (namely, `query` detailing context for the choice and `state` to help inform the choice). A 'force' message implies time sensitivity and requires the server to perform one of the given actions *as soon as possible*.

If the connection drops, on reconnect, the server *may* send a message prompting the client to re-register all currently available actions in order to synchronize state. The client may ignore it if no actions are available; alternatively, the client can send an empty 'register' message. Courteous clients *should* sync state on (re)connect regardless of whether the server sends that message.

### Implementation Details

In this application, the actor's role may be fulfilled by different **engines**, such as:
- Randy (a random generator)
- OpenRouter (a multiplexer/router for LLM inference providers)
- Any OpenAI-compatible service, including local LLM hosts like LMStudio/Ollama (not officially supported; on a best-effort basis)

There's also Tony, which is not an actual engine; 'Tony mode' is a term for when the user manually sends actions through the UI, superseding the active engine.

A session **scheduler** is responsible for processing streams of WebSocket messages coming from games. When an event (e.g. a non-silent message, or an internal timer) calls for it, the scheduler prompts an engine to act.

The engine may choose not to act if not forced; or, alternatively speaking - the engine *must* act if forced. This use of the term "force" is similar in purpose to the WebSocket protocol, but is not the same thing - a scheduler may force an action without an incoming `actions/force` message, e.g. if no actions were taken for a certain amount of time.


## Tauri Application

### Architecture Overview

The Tauri application is in active development and represents the future direction of the project. Tauri is a cross-platform desktop application framework that renders a web-based frontend in the system WebView while passing IPC messages to invoke calls on the Rust backend.

### App Components

#### Build System (`package.json`, `src-tauri/Cargo.toml`)
- `pnpm` and `cargo` - Package management
- Svelte 5 - Reactive web framework
- SvelteKit - Full-stack web framework for Svelte
- Vite - Build tool and dev server

#### [Tauri](https://tauri.app/concept/architecture/) (`src-tauri/`)

The Rust backend for the application. Essentially, it's the layer connecting the frontend to the OS. Since the frontend is basically just a website, when it needs to do desktop things, it passes system calls to the backend through an IPC channel.

There are Tauri plugins to extend the frontend with some common operations:
- File system access (`@tauri-apps/plugin-fs`)
- HTTP client (`@tauri-apps/plugin-http`)
- Logging (`@tauri-apps/plugin-log`)
- Notifications (`@tauri-apps/plugin-notification`)
- Store API (`@tauri-apps/plugin-store`)
- Self-updating (`@tauri-apps/plugin-updater`)

For Gary specifically, it hosts the WebSocket server, relaying messages to the frontend. Rust use in general is preferably kept to a minimum (for various reasons).

#### Frontend Structure (`src/`)
- Application code in `src/lib/`
    - Neuro SDK protocol/WebSocket-related code in `src/lib/api/`
    - App logic (engines, config) in `src/lib/app/`
    - Svelte 5 UI components and utilities in `src/lib/ui/`
- SvelteKit routed pages in `src/routes/`

#### Frontend Stack
- Svelte 5 + SvelteKit + Vite
- Tailwind CSS + Skeleton UI + Lucide Icons
- Svelte Sonner (toasts)
  - Skeleton UI already provides toasts, but Zag (their dependency) has a bug that makes it so toasts never get disposed internally and you reach max toasts very quickly
- CodeMirror code editor
- neverthrow (`Result` type for error handling)
- Zod (parsing & validation)
- Ajv (action schema validation for "schema test" internal game)

## Development Workflow

### Current Development Focus
- The Svelte frontend (`src/`) is the focus for development work going forward.
- The Rust backend (`src-tauri`) should be treated as read-only unless explicitly instructed to work on it.


## Essential Paths for Project Navigation

- `src/lib/api/` - WebSocket API code (game integration)
- `src/lib/` - Application logic
- `src/lib/ui/` - Svelte components and utilities
- `src/routes/` - Application pages and routing
- `src-tauri/` - Rust backend and Tauri configuration
