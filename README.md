## Guidance Gary

An implementation of the LLM side of the [Neuro-sama game SDK](https://github.com/VedalAI/neuro-game-sdk) to test game integrations.
Uses [guidance](https://github.com/guidance-ai/guidance) to coerce the LLM to adhere to the appropriate JSON schema for actions. This works best with a local model (or as I like to refer to it, `Llarry` (Local Larry)).

This is baby's first LLM code and I haven't done Python in years so ~~don't be mean please 🥺👉👈~~ PRs are welcome.
The project is mostly for fun but I'm open to feedback and contributions.

### Features
- Actually follows the schema[^1][^2][^3]
- Generating JSON with guidance is faster than asking the model to adhere to a schema since it auto-inserts tokens that are "constant"
- Aims to (eventually) behave (reasonably) close to Neuro for accurate testing/development

[^1]: Very likely but not guaranteed, see [Known issues/todos](#known-issuestodos).
[^2]: Local models only; you can configure it to use a remote service, but please note that guidance cannot enforce syntax/structured outputs if it can't hook itself into the inference process, so it'll throw exceptions on invalid output instead (allegedly, not tested). For more info, check the [guidance README](https://github.com/guidance-ai/guidance/blob/46340aa58b51a0714066a9faeba18c6cb2128f34/README.md#vertex-ai) or the [guidance server example](https://github.com/guidance-ai/guidance/blob/727e8320062746b019d29a4cf393c88641fd7e4c/notebooks/server_anachronism.ipynb).
[^3]: Not always the best option; see [Known issues/todos](#known-issuestodos).

### Quick start
1. Install [uv](https://github.com/astral-sh/uv)
2. Configure stuff in `config.yaml` (use a YAML language server that supports schemas for an easier time)
3. Run the following command:
```
uv run main.py [--preset your_preset]
```
#### Tips
Smaller models are generally less intelligent than larger ones. A 3B model may not be able to perform logical leaps or multi-step actions without [extreme handholding](https://github.com/Govorunb/guidance-gary/blob/843ea8d01bce2b46396fcdea1b78675eb607d88e/config.py#L90).

Depending on your model/hardware, Larry might be dumber than a rock when it comes to strategy and decisionmaking. Like, *worse than Randy*.
If so, Gary probably cannot help you and you'd be better off using [Randy](https://github.com/VedalAI/neuro-game-sdk/blob/main/Randy/README.md), [Tony](https://github.com/Pasu4/neuro-api-tony), or [Jippity](https://github.com/EnterpriseScratchDev/neuro-api-jippity) instead.

That being said, it's *always* better in the long run to invest effort into refining your prompts to make things clearer.
Getting a less intelligent model to successfully play your game will make more intelligent models even more likely to make smarter decisions.

You probably *should* consider doing the following:
- Use direct and concise language
	- Having less text to process makes the LLM faster and sometimes reduces confusion
	- Natural language (e.g. `Consider your goals`) is okay - it is a language model, after all
	- Aim for high information density - consider running your prompts through a summarizer
	- Including/omitting common-sense stuff can be hit or miss - depends on the intelligence of the LLM
	- Flowery or long-winded descriptions should be used very sparingly - all context influences the response and context that is out-of-tone can throw off the model
	- Structuring info (e.g. with Markdown) seems to improve results - tested on instruct-tuned open models, Neuro might act differently
- Send a description of the game and its rules on startup
- Keep context messages relevant to upcoming actions/decisions so they're closer together in the context window
- Send reminders of rules/tips/state at breakpoints, e.g. starting a new round
- If an action fails because of game state (e.g. trying to place an item in an occupied slot), you should attempt, preferrably in this particular order:
	- Disallow the illegal action (by removing the illegal parameter from the schema, or by unregistering the action entirely)
		- This is the best option
	- Suggest a suitable alternative in the result message
		- For example, `"Battery C is currently charging and cannot be removed. Batteries A and B are charged and available."`
	- Send additional context as a state reminder on failure so the model can retry with more knowledge
	- Or, register a query-like action (e.g. `check_inventory`) that allows the model to ask about the state at any time and just hope for the best

### Known issues/todos
- When the context window is full, it gets truncated, which wipes the LLM's memory and can rarely cause malformed action data and schema errors
	- Larger context windows will get truncated less frequently
	- Managing the context window "properly" is currently out of scope; if it's a big issue for you, yell at me to increase motivation
- Gary doesn't do a bunch of things that Neuro does, like:
	- Processing other sources of information like vision/audio/chat (I don't think I'll be doing this one)
	- Acting on a scheduler (~~periodically acting unprompted~~, generating yaps, simulating waiting for TTS, etc)
	- Running actions on a second thread (todo maybe, depends on the scheduler)
- There's a quirk with the way guidance enforces grammar that can sometimes negatively affect chosen actions.
	- Basically, if the model wants something invalid, it will pick the closest valid option. For example:
		- The model hallucinates about pouring drinks into a glass in its chain-of-thought
		- The token likelihoods now favor `"glass"`, which is not a valid option (but `"gin"` is)
		- When generating the action JSON, guidance picks `"gin"` because it's the most likely of all valid options
	- In a case like this, it would have been better to just let it fail and retry - oh well, unlucky

#### Implementation-specific behaviour
These are edge cases where Neuro may behave differently. For most of these, the spec doesn't say anything, so I had to pick something.
- Registering an action with an existing name will replace the old one
- Only one active websocket connection is allowed per game; when another tries to connect, either the old or the new connection will be closed (configurable in `config.yaml`)
- Gary sends `actions/reregister_all` on every connect (instead of just reconnects, as in the spec)
	- I can probably make something that figures out if it's a first launch or a reconnect but I'm too lazy
- etc etc, just download the repo and search for "IMPL" in the code

#### Acknowledgements
Thanks to all these lovely games for having Neuro integration so I didn't have to develop this blind:
- [Abandoned Pub](https://pipeheads.itch.io/abandoned-pub)
- [neuro scratch](https://tsgscraft.itch.io/neuro-scratch)
- [Branching Paths](https://shardhash.itch.io/branching-paths)
