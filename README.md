## Guidance Gary

An implementation of the LLM side of the [Neuro-sama game SDK](https://github.com/VedalAI/neuro-game-sdk) to test game integrations.
Uses [guidance](https://github.com/guidance-ai/guidance) to coerce the LLM to adhere to the appropriate JSON schema for actions. This works best with a local model (or as I like to refer to it, `Llarry` (Local Larry)).
This is baby's first LLM code and I haven't done Python in years so ~~don't be mean please 🥺👉👈~~ PRs are welcome.
The project is mostly for fun but I'm open to feedback and contributions.

Initially tested on [Abandoned Pub](https://itch.io/jam/neuro/rate/3213265).
### Features
- Actually follows the schema[^1][^2]
- Generating JSON with guidance is faster than asking the model to adhere to a schema since it auto-inserts tokens that are "constant"
- Aims to behave close to Neuro for accurate testing/development

[^1]: Very likely but not guaranteed because I truncate the context window when it gets full. I couldn't be bothered (and also don't know how) to do it properly (currently). Contributions are welcome.
[^2]: Local models only; you can configure it to use a remote service, but please note that guidance cannot enforce syntax/structured outputs if it can't hook itself into the inference process, so it'll throw exceptions on invalid output instead (allegedly, not tested). For more info, check the [guidance README](https://github.com/guidance-ai/guidance/blob/46340aa58b51a0714066a9faeba18c6cb2128f34/README.md#vertex-ai) or the [guidance server example](https://github.com/guidance-ai/guidance/blob/727e8320062746b019d29a4cf393c88641fd7e4c/notebooks/server_anachronism.ipynb).

### Quick start
1. Install [uv](https://github.com/astral-sh/uv)
2. Run the following command:
```
uv run fastapi dev main.py
```
You can configure stuff in `config.py`. I might change it to draw from environment variables later.
The default engine is LlamaCpp; to change it, edit `LLM.__init__` in `llm.py`.
#### Tips
Smaller models behave differently from large ones. A 3B model may not be smart enough to perform logical leaps or multi-step actions without handholding.

Depending on your model/hardware, Larry might be dumber than a rock when it comes to strategy and decisionmaking.
If so, Gary probably cannot help you and you'd be better off using [Randy](https://github.com/VedalAI/neuro-game-sdk/blob/main/Randy/README.md) or [Jippity](https://github.com/EnterpriseScratchDev/neuro-api-jippity) instead.

That being said, it's *always* better in the long run to invest effort into refining your proompting to make things clearer.
Getting a less intelligent model to successfully play your game will make more intelligent models even more likely to make smarter decisions.

You probably *should* consider doing the following:
- Use direct and concise language to reduce token usage - this makes the LLM faster and sometimes reduces confusion
	- Natural language is okay - it is a language model, after all
	- Aim for high information density - consider running your prompts through a summarizer
	- Including/omitting common-sense stuff can be hit or miss - depends on the intelligence of the LLM
	- Flowery or long-winded descriptions should be used very sparingly - all context influences the response and context that is out-of-tone can throw off the model
- Send a description of the game and its rules on startup
- Keep context messages relevant to upcoming actions/decisions
- Send reminders of rules/tips/state at breakpoints, e.g. starting a new round
- If an action fails because of game state (e.g. trying to place an item in an occupied slot), either:
	- Disallow the illegal action (by removing the illegal parameter from the schema, or by unregistering the action entirely)
	- Or, send additional context as a state reminder on failure so the model can retry with more knowledge

### Known issues/todos
- `actions/force` is not retried (todo)
	- I figure matching Randy is fine for now
- When the context window is full, it gets truncated, which can cause malformed action data and schema errors
	- Larger context windows will get truncated less frequently
	- Managing the context window "properly" is currently out of scope; if it's a big issue for you, yell at me to increase motivation
- Gary doesn't do a bunch of things that Neuro does, like:
	- Processing other sources of information like vision/audio/chat (I don't think I'll be doing this one)
	- Acting on a scheduler (periodically acting unprompted, generating yaps, waiting for TTS, etc)
	- Running actions on a second thread (todo maybe, depends on the scheduler)

#### Implementation-specific behaviour
These are edge cases where Neuro may behave differently. For most of these, the spec doesn't say anything, so I had to pick something.
- Registering an existing action will replace the old one
- Only one websocket connection is allowed per game; on conflict, either the old or the new connection will be closed (configurable in `registry.py`)
- On reconnect, Gary will wait for the first message before sending `actions/reregister_all`
	- I can probably make something that figures out if it's a first launch or a reconnect but I'm too lazy
- etc etc, just download the repo and Ctrl-F "IMPL" in the code

