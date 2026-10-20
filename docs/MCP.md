# Driving Gary from an agent (MCP)

Gary serves an [MCP](https://modelcontextprotocol.io) endpoint, so a coding agent such as Claude Code or Codex can watch a session and drive it. The agent can see which games are connected and what they registered, read what the engine sees, send actions as the user, make the engine act, and wait for the results.

## Connecting

The endpoint is part of Gary's game server, so the server has to be running (the power button in the top left). On the default port:

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
| `send_action` | Sends an action to a game as the user, bypassing the engine. |
| `list_engines` | The engines, which one is active, and whether it's busy, paused or acting automatically. |
| `select_engine` | Makes an engine the active one. |
| `act` | Asks the active engine to act now, optionally forcing it to pick an action. |
| `clear_context` | Clears the actor's context. |

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

`wait_for_events` waits for up to 50 seconds per call (30 by default). Gary keeps the newest 1,000 events, and clearing the event log in the app clears them for agents too.
