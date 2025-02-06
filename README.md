## Guidance Gary

An implementation of the LLM side of the [Neuro-sama game SDK](https://github.com/VedalAI/neuro-game-sdk) to test game integrations.
Uses [guidance](https://github.com/guidance-ai/guidance) to coerce the LLM to adhere to the appropriate JSON schema for actions. This works best with a local model (or as I like to refer to it, `Llarry` (Local Larry)).

This is baby's first LLM code and I haven't done Python in years so ~~don't be mean please 🥺👉👈~~ PRs are welcome.
The project is mostly for fun but I'm open to feedback and contributions.

### Features
- Can use a few model engines/providers:
	- Local models (LlamaCpp, Transformers\*)
	- Remote Guidance server\*
	- A "[Randy](https://github.com/VedalAI/neuro-game-sdk/blob/main/Randy/README.md)-like" random generator
	- Remote services (OpenAI, Anthropic, Google, Azure) are *not* supported. For more info, read the ["Remote Services?"](#remote-services-openai-anthropic-google-azure) section.
- **Guaranteed** to follow the schema[^1][^2]
- Generating with guidance is faster than asking the model to adhere to a format since it auto-completes tokens that don't depend on the LLM (e.g. JSON syntax)
- Aims to (eventually) behave (reasonably) close to Neuro for accurate testing/development
- Offers a web interface (**WIP**) for [Tony](https://github.com/Pasu4/neuro-api-tony)-like manual action sending
![image](https://github.com/user-attachments/assets/be4c520c-4e17-436b-81e9-1288f054913a)

<sub>\* Not tested - if you know this works (or doesn't), open an issue.</sub><br/>

That said...
> [!Note]
> The project is currently in the early stages of development and is thus **unstable**.
>
> Some areas or systems may change their behaviour and/or internals (especially internals).
>
> Take a look at the [Known issues/todos](#known-issuestodos) section for an idea of what might change in the future.

[^1]: Very very likely but not (yet) guaranteed, see [Known issues/todos](#known-issuestodos).
[^2]: Not always the best option; see [Known issues/todos](#known-issuestodos).

### Quick start
1. Install [uv](https://github.com/astral-sh/uv#installation)
2. Configure stuff in `config.yaml` (use a YAML language server that supports schemas for an easier time)
3. Run the following command:
```
uv run gary [--preset your_preset] [--config _my_config.yaml]
```
Instead of modifying `config.yaml` (which would get picked up by git) you should make a copy prefixed with an underscore (e.g. `_my_config.yaml`) and point Gary at it with either the `--config` flag or the `GARY_CONFIG_FILE` environment variable. Gary reads dotenv so you can make a `.env` file with the following contents:
```
GARY_CONFIG_FILE=_my_config.yaml
GARY_CONFIG_PRESET=randy
```

### Tips
Smaller models are generally less intelligent than larger ones. A 3B model may not be able to perform logical leaps or multi-step actions without [extreme handholding](https://github.com/Govorunb/guidance-gary/blob/843ea8d01bce2b46396fcdea1b78675eb607d88e/config.py#L90).

Since this project is focused on local models, success will depend on your model/hardware. Larry might turn out to be dumber than a rock when it comes to strategy and decisionmaking (which is ironic because it's made of rock) - maybe even *worse than Randy*.
If so, Gary probably cannot help you and you'd be better off using [Randy](https://github.com/VedalAI/neuro-game-sdk/blob/main/Randy/README.md), [Tony](https://github.com/Pasu4/neuro-api-tony), or [Jippity](https://github.com/EnterpriseScratchDev/neuro-api-jippity) instead.

That being said, it's *always* better in the long run to invest effort into refining your prompts to make things clearer.
Getting a less intelligent model to successfully play your game will help more intelligent models make even smarter decisions.

You probably *should* consider doing the following:
#### Prompting
- Use direct and concise language
	- Having less text to process makes the LLM faster and sometimes reduces confusion
	- Aim for high information density - consider running your prompts through a summarizer
	- (opinion) Flowery or long-winded descriptions should be used very sparingly - all context influences the response and context that is out-of-tone can throw off the model
- Natural language (e.g. `Consider your goals`) is okay - it is a language model, after all
- Including/omitting common-sense stuff can be hit or miss - depends on the intelligence of the LLM
- Structuring info (e.g. with Markdown) seems to improve results
	- Tested on instruct-tuned open models, Neuro might act differently

#### Context
- Send a description of the game and its rules on startup
- Keep context messages relevant to upcoming actions/decisions
- Send reminders of rules/tips/state at breakpoints, e.g. starting a new round
- If an action fails because of game state (e.g. trying to place an item in an occupied slot), you should attempt, preferrably in this particular order:
	- Disallow the illegal action (by removing the illegal parameter from the schema, or by unregistering the action entirely)
		- This is the best option as there's no chance for mistakes at all
	- Suggest a suitable alternative in the result message
		- For example, `"Battery C is currently charging and cannot be removed. Batteries A and B are charged and available."`
	- Send additional context as a state reminder on failure so the model can retry with more knowledge
	- Or, register a query-like action (e.g. `check_inventory`) that allows the model to ask about the state at any time and just hope for the best

### Known issues/todos
- Gary doesn't do a bunch of things that Neuro does, like:
	- Processing other sources of information like vision/audio/chat (I don't think I'll be doing this one)
	- Acting on a scheduler (~~periodically acting unprompted~~, generating yaps, simulating waiting for TTS, etc)
	- Running actions off the main thread (todo maybe, depends on the scheduler)
- There's a quirk with the way guidance enforces grammar that can sometimes negatively affect chosen actions.
	- Basically, if the model wants something invalid, it will pick a similar or seemingly arbitrary valid option. For example:
		- The model hallucinates about pouring drinks into a glass in its chain-of-thought
		- The token likelihoods now favor `"glass"`, which is not a valid option (but `"gin"` is)
		- When generating the action JSON, guidance picks `"gin"` because *(gives a long explanation)*
	- For nerds - guidance uses the model to generate the starting tokens and forwards the rest as soon as it's fully disambiguated (so e.g. `"g` has the highest likelihood, so it gets picked, and then `in"` is auto-completed because `"gin"` is the only option starting with `"g`, even though in reality the model wanted to say `"glass"`). [Learn more](https://github.com/guidance-ai/guidance/issues/564)
	- In a case like this, it would have been better to just let it fail and retry - oh well, at least it's fast
- The way I trim context to keep LlamaCpp able to generate infinitely only works with local LlamaCpp (Guidance server would probably work too). Transformers will instead fully truncate context, and may rarely fail due to overrunning the context window. Not tested.
- The web interface can be a bit flaky - keep an eye out for any exceptions in the terminal window and, when in doubt, refresh the page
	- There's a non-zero chance I won't be able to polish it up to an acceptable level - if so, I'll probably ragequit the current implementation (using [panel](https://github.com/holoviz/panel/)) and go write a TS frontend or something instead. Send thoughts and prayers please

#### Implementation-specific behaviour
These are edge cases where Neuro may behave differently.
- Registering an action with an existing name will replace the old one (by default)
	- [The spec](https://github.com/VedalAI/neuro-game-sdk/blob/8c0f682c5d4fa804119e7168a558e8c0568fe1fb/API/SPECIFICATION.md#parameters-3) suggests the exact opposite - that the incoming action should be discarded
	- I'm making the "wrong" behaviour default on purpose because I think it's the more natural of the two - but frankly, relying on either behaviour is not good
	- You can switch to follow the spec by setting `(preset).gary.existing_action_policy` to `drop_incoming` in your `config.yaml`
- Only one active websocket connection is allowed per game; when another tries to connect, either the old or the new connection will be closed (configurable in `config.yaml`)
- Gary sends `actions/reregister_all` on every connect (instead of just reconnects, as in the spec)
	- I can probably make something that figures out if it's a first launch or a reconnect but I'm too lazy
- etc etc, just download the repo and search for "IMPL" in the code

#### Remote services? (OpenAI, Anthropic, Google, Azure)
Only local models (and guidance server) are supported. Guidance lets you use remote services, but it cannot enforce grammar/structured outputs if it can't hook itself into the inference process, so it's *more than likely* it'll just throw exceptions because of invalid output instead.

![log excerpt showing remote generation failed after exceeding the limit of 10 attempts](https://i.imgur.com/UNtnhdV.png)

For more info, check the [guidance README](https://github.com/guidance-ai/guidance/blob/46340aa58b51a0714066a9faeba18c6cb2128f34/README.md#vertex-ai) or the [guidance server example](https://github.com/guidance-ai/guidance/blob/727e8320062746b019d29a4cf393c88641fd7e4c/notebooks/server_anachronism.ipynb).

Guidance does work with [Phi3 on Azure](https://github.com/microsoft/Phi-3CookBook/blob/main/code/01.Introduce/guidance.ipynb), but it's not implemented here due to lack of interest.

#### Acknowledgements
Thanks to all these lovely games for having Neuro integration so I didn't have to develop this blind:
- [Abandoned Pub](https://pipeheads.itch.io/abandoned-pub)
- [Branching Paths](https://shardhash.itch.io/branching-paths)
- [neuro scratch](https://tsgscraft.itch.io/neuro-scratch)
- and more!
