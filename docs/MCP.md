# Driving Gary from an agent (MCP)

Gary serves an [MCP](https://modelcontextprotocol.io) endpoint, so a coding agent such as Claude Code or Codex can watch a session and drive it. The agent can see which games are connected and what they registered, read what the engine sees, and wait for results. It can also act on the session as the user: send actions and raw messages, add to the engine's context, make the engine act or stop, pause it, and switch engines.

## Connecting

The endpoint is part of Gary's game server, so the server has to be running. Start it with the power button in the top left, turn on "Start server on launch" in its settings, or launch Gary with `--start-server`. On the default port:

```sh
claude mcp add --transport http gary http://127.0.0.1:8000/mcp
codex mcp add gary --url http://127.0.0.1:8000/mcp
```

There is no authentication, but the endpoint only accepts connections from this machine, even when the game server listens on all interfaces for remote games. Agents never see API keys or other engine settings, and sensitive event fields are redacted.

## Tools

| Tool | What it does |
|---|---|
| `list_games` | Connected games with their actions (name, description, schema, whether still registered). |
| `get_diagnostics` | Protocol problems Gary found in each game, with an explanation of each. |
| `get_context` | The actor's context: the history the engine decides from. |
| `read_events` | The newest events from Gary's event log, filtered by key prefix and level. |
| `wait_for_events` | Waits for the next event matching a key prefix and returns it with the events before it. |
| `send_action` | Sends an action to a game as the user, bypassing the engine. `rawData` sends the data's exact text instead, even if it isn't valid JSON. |
| `send_raw_message` | Sends any text to a game, unchecked, like the raw message dialog. |
| `disconnect_game` | Closes a game's connection. |
| `list_engines` | The engines, which one is active, and whether it's busy, paused or acting automatically. |
| `select_engine` | Makes an engine the active one. |
| `act` | Asks the active engine to act now, optionally forcing it to pick an action. |
| `stop_act` | Stops the engine's current act. |
| `set_paused` | Pauses or unpauses the engine. A paused engine doesn't act, even when asked. |
| `set_auto_act` | Turns auto-act on or off. |
| `add_context` | Adds a message to the engine's context as the user, prompting it to act unless it's silent. |
| `clear_context` | Clears the actor's context. |
| `capture_decision` | The engine's last decision (or the one it would face now) as JSON: the session's events up to it, ending with the decision itself (the actions offered, the engine and the system prompt), plus the engines to run. |
| `run_decision` | Replays a captured decision several times, optionally on other engines, and returns how often each choice came up. It doesn't touch the live session, but LLM trials cost money. |

## Cursors and waiting

Every successful tool result has a `cursor`: the position in Gary's event log when the tool ran. Pass it as `after` to `read_events` or `wait_for_events` to see only what happened since. Because the cursor is taken before a command runs, nothing is lost if the game answers before the agent starts waiting.

To send an action and see its result:

1. `send_action` with `{ "game": "<id>", "action": "jump", "data": { "height": 2 } }` returns `{ "cursor": 120 }`.
2. `wait_for_events` with `{ "after": 120, "keys": ["api/game/action_result"] }` returns the result as `matched`, the events that led up to it as `events`, and a new `cursor` right after the match for the next wait.

`act` works the same way. The engine's choice arrives as `api/actor/act`, `api/actor/say` or `api/actor/skip`, and an act that couldn't happen shows up under `app/scheduler/act/`.

Keys are matched by prefix, so `api/game/` covers everything games send. Useful keys:

| Key | Meaning |
|---|---|
| `api/game/context` | A game sent context. |
| `api/game/force` | A game forced the actor to pick an action. |
| `api/game/action_result` | A game answered an action. |
| `api/actor/` | The engine acted, spoke or skipped. |
| `app/diagnostics/triggered` | Gary found a problem in a game's protocol use. |

To find out why the engine made a choice, capture the decision, edit its events (a game's context, an action's description) or the decision itself, and run both versions a few times. One run proves little, since engines aren't deterministic.

`wait_for_events` waits for up to 50 seconds per call (30 by default), and `run_decision` stops after 50 seconds with the trials it finished. Gary keeps the newest 1,000 events, and clearing the event log in the app clears them for agents too.
