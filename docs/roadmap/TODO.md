# Project roadmap

## Current development

The project recently underwent a renovation, porting functionality and UI from Python to Tauri. It is currently somewhere around a "late alpha", adding functionality and freely changing internals.

- `src/` - Svelte 5 frontend and application logic. Nearly all development will happen here.
- `src-tauri/` - Rust backend. Only edit if explicitly asked to.

### Task list

App logic:
- [.] Scheduler stuff
    - [ ] Timer for poke/force (both timers reset when an action is performed; poke resets on attempt)
    - [ ] Non-silent message (from user) with no connected games still primes the scheduler
- [.] OpenRouter (broken)
- [ ] Prefs
    - [ ] File backing storage (so it's user editable)
    - [ ] `$env:MY_ENV_VAR` syntax (for API keys etc)
    - [x] Actual config UI
    - [ ] Reimplement presets/profiles again
- [.] [Context](./context.md)

Frontend:
- [ ] Extra context features
    - [ ] Menu (buttons to copy message text, ID, etc)
    - [ ] Editing the log - edit message text, remove message
- [ ] Performance (because WebKit is ngmi)
    - [ ] Virtualize context log https://tanstack.com/virtual/latest/docs/introduction
    - [ ] Keep a CodeMirror instance loaded offscreen and Portal it into dialogs (deranged)
    - [ ] Streaming reactive ctx message conversion (entirely reimplement rx it'll be funny)
- [ ] Launch game processes (+ proposed shutdown API)
- [x] App logs should show in UI somewhere
- [ ] Collapse left sidebar to hamburger on small widths

### Miscellaneous task list

#### Multi-game action collisions
With single-context (and single-engine) two games may register actions with the same name.
A possible solution is renaming the colliding actions to `action(game)` or something, only when passing the list of actions to the engine.

#### Strict ("prod") diagnostics

The live production implementation contains implementation details of its own - e.g. the client should send action result responses *as soon as possible*, since (I assume) it behaves like an LLM tool call, i.e. generation halts and waits for the result to insert it into the context window. Gary may in the future provide diagnostics to help game integrations conform to the prod environment rather than an idealized test one.

#### UI modes/auto checks

I like the idea of collapsing everything down to just a list of connected games with a small display for any opinionated warnings/advice, to quickly test the behaviour of an integration and confirm it conforms to the spec and acts in an acceptable way.

Same with e.g. accomodating someone testing their SDK implementation vs a game integration - they have different requirements, and it'd be nice to have modes that focus in on each of those workflows.

Previously this was sort of kind of accomodated by allowing different logging levels for each module/"subsystem" (e.g. logging websockets at `trace` to diagnose message passing), but I wonder if it could be made more ergonomic.

#### Configure scheduler timers

I want to see Randy speed through the schema test in 0.1 seconds

#### Per-game tweaks/compat

v2 of the API has been in proposals for a while now. If the spec turns out to land into an "evolving v1" state, old and new integrations will have the same version but completely different expectations - e.g. some would expect a `actions/reregister_all` on connect before registering actions, some would do it automatically (and, worst case, error out and disconnect if sent a `reregister_all`). This will require per-game behaviour tweaks for compatibility.

The first step would be a UI (dialog opened from game menu?), then maybe some automation (e.g. if after connect the game doesn't send actions in the first 2s, try sending a reregister; if the game then errors/disconnects because of a strict message handler, don't do it again and remember in user prefs).

#### Anonymized session data

Data is poison, so there won't be any automatically gathered telemetry. If there's a manual copy-context-log-to-clipboard-as-JSON error report process, I'd like to make some toggles for redacting things from the log. Removing message text, timestamps, hiding individual messages, replacing IDs with monotonically increasing, etc.
