# Project Summary

Gary is a project that allows LLMs to interface with controllable client apps ("game integrations"). It implements a backend for the [Neuro-sama SDK](https://github.com/vedalai/neuro-sdk) to allow developers of game integrations to test them on a system approximating the production one.

Refer to `docs/ARCHITECTURE.md` for a technical overview of the project's architecture if needed.

`docs/ROADMAP.md` contains the current development goals. Keep these in mind when implementing or planning.

`app/src/UI_PORT.md` documents the current UI port plan for the Tauri frontend.

## Agent Development Guidelines

### Frontend

Currently, LLMs are likely to output outdated Svelte code that uses legacy features like implicit reactivity or `$:` statements. Svelte 5 has changed drastically from the previous versions, so review `docs/svelte5.md` and the [Svelte 5 docs](https://svelte.dev/docs) for a refresher on the new runes-based model.

Additionally, since this is a frontend for an entirely client-side app, no server-side code patterns will work. It will render in the user's system WebView, which means Node is also not available, and system calls are handled through IPC messages to Tauri (e.g. filesystem access is handled through the `@tauri-apps/plugin-fs` Tauri plugin).

### Backend

The Rust side should handle as little as possible to keep the majority of app logic concentrated in just TypeScript (for maintainability). The only things that must be handed over to Rust are system calls and things that aren't possible to do on the frontend; for example, we can't host a WebSocket server from the system WebView, so we must use Rust for that. But, since the Rust side should stay out of app logic, it just forwards messages to the frontend and does not handle any of them.

Rust will also handle local LLM generation through `llama-cpp`, which is currently yet to be implemented.
