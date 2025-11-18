# Project roadmap

## Current development

The project is currently undergoing a renovation, porting functionality and UI from Python to Tauri:

- `src/gary/` - Stable Python app. Agents **must not** modify this project.
- `app/` - In-dev Tauri port of the application.
    - `app/src` - Svelte 5 frontend and application logic. Nearly all development will happen here.
    - `app/src-tauri` - Rust backend. Only edit if explicitly asked to.

### Task list

App logic:
- [x] Get Randy running and responding to actions
    - [x] Scheduler with manual poke/force
    - [ ] Timer for poke/force (both timers reset when an action is performed; poke resets on attempt)
- [x] OpenRouter
- [x] Other OpenAI-compatible services (Local LLMs, OpenAI proper, etc)

Frontend:
- [ ] Tony mode (manual action sending)
    - [ ] Code editor (`codemirror`)
    - [ ] Validation with shift-click override
    - [ ] Auto-generated action forms (from schema)
        - [ ] Primitives, Enums
        - [ ] Arrays
        - [ ] Objects (& nesting)
        - [ ] Unions (maybe, they're not supported in sdk)
        - [ ] Optional properties
- [ ] Add functionality to context log
    - [ ] Click for details dialog
    - [ ] Corner indicators for source, silent/ephemeral
    - [ ] Buttons to copy message text, ID, etc
    - [ ] Editing the log - edit message text, remove message
- [x] Engine config
    - [x] API key (field or PKCE)
    - [x] Model field (+helper directing to OpRt website)
    - [x] Allow waiting/yapping
    - [ ] `$env:MY_ENV_VAR` for prefs


### Future plans

After the port is complete, the Python app will be deprecated and removed. Then, some long-standing TODOs may finally be addressed:

#### Engine hot-swapping

Previously, the LLM engine was selected on startup and could not be changed. The user should be able to pick the engine at runtime and switch between them as needed (maybe per-context, or even per-game).

#### Remote LLM Support

The Tauri app will support OpenAI-compatible remote APIs - specifically, OpenRouter will get direct support, with a generic engine exposed for other services.

#### Miscellaneous task list
- Actual config UI (I can't believe this wasn't done already)
    - Editable config file (currently using `localStorage`)
    - Reimplement presets/profiles again
- Launching game processes (enabling use of the proposed Shutdown API)
- App logs should also show up in UI (accessible as scroll log/toast notifications)
- Multi-game action collisions
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

The first step would be a UI (probably using the advanced sidebar), then maybe some automation (e.g. if after connect the game doesn't send actions in the first 2s, try sending a reregister; if the game then errors/disconnects because of a strict message handler, don't do it again and remember in user prefs).

#### Anonymized session data

Data is poison, so there won't be any automatically gathered telemetry. If there's a manual copy-context-log-to-clipboard-as-JSON error report process, I'd like to make some toggles for redacting things from the log. Removing message text, timestamps, hiding individual messages, replacing IDs with monotonically increasing, etc.
