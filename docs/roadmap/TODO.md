# Project roadmap

## Candidates for next major

- Event log + granular exports (visibility presets - "user", "actor", "bug report")
- Tool calling + reasoning/interleaved thinking (toggle "fast call"/"deep think")
    - Responses API?
- Game management (user-defined list of launch commands, shutdown API)
- Advanced context editing?
- API compat/behavior switches (e.g. whether to send `reregister_all`)
- Local web UI (to end the suffering of Linux users (if any))

## Task list grab bag

### Neuro API

- [ ] Use force prio literally anywhere (shorten Randy l*tency/interrupt LLM gen)
    - We don't wait for TTS so `low`-`high` are useless - `critical` should interrupt
    - Should this interrupt other forces?
- [ ] Ephemeral force
    - "Parallel processing", context merging headache - I really don't think Gary should have to deal with this
- [ ] Deprecate `reregister_all` and stuff it behind a compat flag

### App logic

- [ ] Non-silent message (from user) with no connected games still primes the scheduler (should call model if yapping is allowed?)
- [ ] 'Strict mode' that raises all diagnostic severities by 1 (warnings become errors, errors become fatal and instantly disconnect WS)
- [ ] Figure out where game-specific prefs go when the game changes name
- [ ] Scheduler takes from games' forceQueues instead of games pushing to its "central" FQ
    - Might solve an edge case where 2+ connected games could trigger `prot/force/multiple` on each other through no fault of their own
- [ ] `$env:MY_ENV_VAR` prefs syntax (for API keys and such)
    - Was thinking about external providers/plugins but it's too much work for single-digit count of devs+users
- Context trimming
    - [ ] Token counting from inference provider responses
    - [ ] Priority trimming (actions/results are less important)
    - User should define context limit (we can't know it automatically) which is awkward/a hassle
- [ ] Option to force safe mode on launch (in case someone manages to softlock with weird prefs)
    - e.g. holding Esc+F1 on launch, or a `--safe-mode` arg
- Diagnostics
    - [ ] `perf/spam/*` - e.g. context too big, send rate too fast, etc.
    - [ ] `perf/schema/confusing` - weird/unhinged schema behavior e.g. array/object literals in `enum`s
    - Come up with more

### Frontend

- Extra context log features
    - [ ] Menu (buttons to copy message text, ID, etc)
    - [ ] Editing the log - edit message text, remove message
    - [ ] "Act (forced)"/"Gary wants attention" should be a heading (like [game name for client msgs](https://github.com/Govorunb/gary/blob/9997b2151f180cd339d6d7b93aa17c3ff687bc21/src/lib/ui/app/context/ContextMessage.svelte#L50-L59))
    - [ ] Save/show which engine was the 'actor'
- Performance (because WebKit is [ngmi](https://github.com/orgs/tauri-apps/discussions/8524))
    - [ ] Virtualize context log https://tanstack.com/virtual/latest/docs/introduction
    - [ ] Keep a CodeMirror instance loaded offscreen and Portal it into dialogs (deranged)
    - [ ] Streaming reactive ctx message conversion (entirely reimplement rx it'll be funny)
- [ ] Launch game processes (+ proposed shutdown API)
- More width-responsive UI
    - [ ] Collapse left sidebar to slide-out on small widths
    - [ ] On fullscreen, use empty right half for something (event log?)
- Diagnostics
    - [ ] Filtering/sorting (errors first, only warnings, regex etc.)
    - [ ] More useful tooltip/popover on status dot
    - [ ] Maybe have the status dot be the menu button
- [ ] Allow binding to `0.0.0.0`
- Onboarding (docs, first-time teaching tips)
    - [ ] First-time tip for when an engine error pauses the scheduler
- Spamming toasts seriously hurts performance
- Context log height gets recalculated a lot
- [ ] Hide safe mode editor behind a toggle so it doesn't flashbang you with API keys

## Miscellaneous wishlist/musings

### Multi-game action collisions
With games sharing the same context, two games may register actions with the same name.
A possible solution is renaming the colliding actions to `action(game)` or something, only when passing the list of actions to the engine.

### UI modes/auto checks

I like the idea of collapsing everything down to just a list of connected games with a small display for any opinionated warnings/advice, to quickly test the behavior of an integration and confirm it conforms to the spec and acts in an acceptable way.

Same with e.g. accomodating someone testing their SDK implementation vs a game integration - they have different requirements, and it'd be nice to have modes that focus in on each of those workflows.

Previously this was sort of kind of accomodated by allowing different logging levels for each module/"subsystem" (e.g. logging websockets at `trace` to diagnose message passing), but I wonder if it could be made more ergonomic.

### Per-game tweaks/compat

v2 of the API has been in proposals for a while now. If the spec turns out to land into an "evolving v1" state, old and new integrations will have the same version but completely different expectations - e.g. some would expect a `actions/reregister_all` on connect before registering actions, some would do it automatically (and, worst case, error out and disconnect if sent a `reregister_all`). This will require per-game behavior tweaks for compatibility.

The first step would be a UI (dialog opened from game menu?), then maybe some automation (e.g. if after connect the game doesn't send actions in the first 2s, try sending a reregister; if the game then errors/disconnects because of a strict message handler, don't do it again and remember in user prefs).

### Anonymized session data

Data is poison, so there won't be any automatically gathered telemetry. If there's a manual copy-context-log-to-clipboard-as-JSON error report process, I'd like to make some toggles for redacting things from the log. Removing message text, timestamps, hiding individual messages, replacing IDs with monotonically increasing, etc.
