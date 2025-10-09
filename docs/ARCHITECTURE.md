# Project Architecture

## Overview

Gary is a project that allows LLMs to interface with controllable client apps ("game integrations"). It implements a backend for the [Neuro-sama SDK](https://github.com/VedalAI/neuro-sdk) to allow developers of game integrations to test them on a system approximating the production one.

Gary consists of two main components:

- **Backend Server** (`src/gary/`) - WebSocket server that acts as the backend layer for game integrations, following a custom protocol (`src/gary/spec.py`)
- **Management Web UI** (`src/gary/web/`) - Web interface for game management, manual action sending, and context window control, using the `panel` Python package

The project is currently undergoing a renovation, porting functionality and UI from Python to Tauri:

1. **Python** (`src/gary/`) - Current stable version with FastAPI/Panel web interface
2. **Tauri** (`app/`) - Modern desktop application in early development using Svelte 5 for the frontend

### WebSocket Protocol

Generally, the flow goes as follows:

The **client** (game integration) connects to **server** (backend).

Then, the following happens until either side disconnects (e.g. the game ends):
1. Client registers **actions** as available to be performed
  - Actions contain an **action schema** (JSON schema) for **action data**
2. As things happen in the game, the client sends **context** to inform the LLM
3. At some point in time, the **LLM** on the server indicates it wants to perform an action and generates action data for it
4. The server sends the action (with data) to the client, which validates it against the action schema and attempts to execute the action
5. The client responds with the **action result**, which is also inserted into context as feedback to the LLM
6. The client may **unregister** the action, e.g. if it was a one-off action that is not repeatable
7. At any point, the client may send a **force action** message with a subset of valid actions, which *requires* the server to send a response performing one of the given actions *as soon as possible*

If the connection drops, on reconnect, the server will send a message prompting the client to re-register all currently available actions. The client should ignore it if no actions are available.

## Stable - Python Application (`src/gary/`)

### Application Components

- Entry point (`src/gary/__main__.py`) - loads config (from `src/util/config.py`) and starts a Uvicorn server, which loads the core application
- Core application (`src/gary/app.py`) - hosts a FastAPI application, accepting WebSocket connections on the root path (`/`), and starts the web UI
- Web interface (`src/gary/web/`) - Panel-based web interface for game management, manual action sending, and context window control
- Game registry (`src/gary/registry.py`) - tracks and manages game connections
- LLM integration (`src/gary/llm/`) - includes a scheduler that pokes the LLM to generate actions
- Utilities (`src/gary/util/`) - miscellaneous code like config and logging

### Additional Technologies

Some more tech used but not mentioned above:
- [`guidance`](https://github.com/guidance-ai/guidance) - Fast constrained LLM generation
- `llama-cpp`/`transformers` - To load the actual language models
- `pydantic` - Data models and validation for WS spec and config
- `uv` - Package manager & app runner
- `loguru` + `colorlog` - Logging
- `orjson` for faster JSON serialization, `jsonschema` for validation against action schemas, and `jsf` for generating random actions (Randy)

### Configuration
- YAML-based configuration system (`config.yaml` for an example config)
  - Main design - presets (base presets with overrides)
  - Select preset to load with CLI option or environment variable
  - Loads `.env` to simplify configuration
- Config format is documented mainly through schema (`config.schema.yaml`)


## Development - Tauri Application (`app/`)

### Architecture Overview

The Tauri application is in **early development** and represents the future direction of the project. Tauri is a cross-platform desktop application framework that renders a web-based frontend in the system WebView while passing IPC messages to invoke calls on the Rust backend.

### App Components

#### Build System (`app/package.json`, `app/src-tauri/Cargo.toml`)
- `pnpm` and `cargo` - Package management
- Svelte 5 - Reactive web framework
- SvelteKit - Full-stack web framework for Svelte
- Vite - Build tool and dev server

#### Tauri (`app/src-tauri/`)
- Rust backend for desktop application
- Handles acting as the WebSocket server, relaying messages to the frontend
- Also responsible for LLM generation (planned, not implemented yet)
- Tauri plugins to allow the frontend to invoke common system calls:
  - File system access (`@tauri-apps/plugin-fs`)
  - HTTP client (`@tauri-apps/plugin-http`)
  - Logging (`@tauri-apps/plugin-log`)
  - Notifications (`@tauri-apps/plugin-notification`)
  - Store API (`@tauri-apps/plugin-store`)
  - WebSocket client (`@tauri-apps/plugin-websocket`)

#### Frontend Structure (`app/src/`)
- Application code in `app/src/lib/`
    - Neuro SDK protocol/WebSocket-related code in `app/src/lib/api/`
    - Application-specific code in `app/src/lib/app/`
    - Svelte 5 UI components and utils in `app/src/lib/ui/`
- SvelteKit routed pages in `app/src/routes/`
- Zod to validate incoming WebSocket messages


## Development Workflow

### Current Development Focus
- Python app (`src/gary/`) is stable and manually maintained by the repo owner. Agent contributors should treat it as read-only.
- The Tauri frontend (`app/src/`) is the focus for development work going forward.
- The Tauri backend (`app/src-tauri`) should be treated as read-only unless explicitly instructed to work on it.


## Key Paths for LLM Project Navigation

### Python App Essential Paths
- `src/gary/app.py` - Main FastAPI application and WebSocket handler
- `src/gary/web/ui.py` - Panel web interface implementation
- `src/gary/registry.py` - Game instance management
- `src/gary/llm/` - Language model integration

### Tauri App Essential Paths
- `app/src/lib/api/` - WebSocket API code (game integration)
- `app/src/lib/app/` - Application-specific code
- `app/src/lib/ui/` - Svelte components and utilities
- `app/src/routes/` - Application pages and routing
- `app/src-tauri/` - Rust backend and Tauri configuration


## Project Structure Summary
```
gary/
├── src/gary/          # Python app (stable)
│   ├── app.py         # FastAPI application
|   ├── registry.py    # Game state management
|   ├── spec.py        # WebSocket protocol
│   ├── llm/           # LLM-related code (e.g. event scheduler)
│   └── util/          # Utility code (e.g. config)
│   ├── web/           # Panel web UI
└── app/               # Tauri app (development)
    ├── src/           # Svelte 5 frontend
    └── src-tauri/     # Rust desktop backend
```