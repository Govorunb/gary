from enum import Enum
import dotenv, yaml, argparse
from os import environ
from typing import * # type: ignore
from pydantic import BaseModel

parser = argparse.ArgumentParser()
parser.add_argument("--config", help="Path to config file (default: 'config.yaml')")
parser.add_argument("--preset", help="Preset from config file to use (default: 'default')")
args = parser.parse_args()
dotenv.load_dotenv(dotenv.find_dotenv(), override=True)
CONFIG_PATH = args.config or environ.get("CONFIG_FILE", "config.yaml")
PRESET = args.preset or environ.get("CONFIG_PRESET", "default")

class ExistingConnectionPolicy(Enum):
    DISCONNECT_NEW = "disconnect_new"
    DISCONNECT_EXISTING = "disconnect_existing"

_LogLevel = Literal["all", "debug", "info", "warn", "warning", "error", "critical", "fatal", "none"] | int
class Config(BaseModel):
    class LLMConfig(BaseModel):
        engine: Literal["openai", "anthropic", "azure_openai", "googleai", "transformers", "llama_cpp", "guidance_server", "randy"]
        model: str
        api_key: str = ""
    class GaryConfig(BaseModel):
        class SchedulerConfig(BaseModel):
            idle_timeout_try: float = 5.0
            '''If the LLM does not act for this many seconds, manually ask it to act (it may decide not to).'''
            idle_timeout_force: float = 30.0
            '''If the LLM does not act for this many seconds, force it to pick an action to perform.'''
        log_level_file: _LogLevel = "info"
        log_level_console: _LogLevel = "debug"
        existing_connection_policy: ExistingConnectionPolicy = ExistingConnectionPolicy.DISCONNECT_EXISTING
        '''What to do when someone tries to connect to a game that already has an active connection.'''
        enable_cot: bool = False
        '''
        Enable poor man's chain-of-thought.
        In my testing, this just consumes a bunch more tokens without a tangible difference.
        A lot of the time, the 'reasoning' is full of hallucinations and the model chooses to do something irrelevant anyway.
        '''
        non_ephemeral_try_context: bool = False
        '''
        Don't discard context from picking whether to act or not. This can eat up a lot of tokens.
        If the model happens to generate good reasoning for it, this will help when picking the action.
        If your model hallucinates a lot, it will very much not help.
        Requires `enable_cot` to have any effect.
        You should play around with this.
        '''
        scheduler: SchedulerConfig = SchedulerConfig()
    fastapi: dict[str, Any] = {}
    llm: LLMConfig
    engine_params: dict[str, Any] = {}
    gary: GaryConfig = GaryConfig()

def _merge_nested_dicts(a: dict[str, Any], b: dict[str, Any]):
    if not a:
        return b
    if not b:
        return a
    out = dict(a)
    for k, bv in b.items():
        if isinstance(bv, dict):
            out[k] = _merge_nested_dicts(a.get(k, None), bv)
        else:
            out[k] = bv
    return out

def _load_config(preset_name: str):
    with open(CONFIG_PATH) as f:
        config_yaml: dict = yaml.safe_load(f)
    preset: dict
    if not (preset := config_yaml.get(preset_name, None)):
        raise ValueError(f"Preset '{preset_name}' was not found in config.yaml")
    if base := preset.get("base", None):
        if not (base_preset := config_yaml.get(base, None)):
            raise ValueError(f"Base preset '{base}' (from '{preset_name}') was not found in config.yaml")
        preset = _merge_nested_dicts(base_preset, preset["overrides"])

    def replace_env(d: dict[str, Any]) -> dict[str, Any]:
        out = {}
        for k, v in d.items():
            out[k] = replace_env(v) if isinstance(v, dict)\
                else environ.get(v[5:], v) if isinstance(v, str) and v.startswith("$ENV:")\
                else v
        return out

    preset = replace_env(preset)
    # print(preset)
    return preset

CONFIG = Config(**_load_config(PRESET))

# temp i guess
# these are always kept in the context
# more intelligent models need less handholding
# unfortunately all that fits in my 8GB VRAM is a 3B phi3.5 with 8k ctx and an 8B llama3.1 with 4k ctx
# i tried a Q3 Phi4 but it ran at 1tok/s, it took so long to respond the game timed out the websocket connection
MANUAL_RULES = {
    # the real question is, is it the llm that's stupid or is it actually me
    "Abandoned Pub": """\
GAME RULES:
The game features two roles:
- **Samantha (AI Bartender)**: Serve drinks to customers by preparing orders.
- **Kayori (Customer)**: Order drinks and set time limits for Samantha.

### SAMANTHA'S INSTRUCTIONS:
1. **Wait for a Customer**
   - Perform actions only after a customer arrives.
   - Check the recipe book to see what the customer ordered.

2. **Serve the Customer's Order**
   - **If the drink is in storage**: Pick it up and serve it.
   - **If the drink requires a recipe**:
     a. Check the recipe book for instructions (e.g., "Drink A: carbonate item 1; serve customer").
     b. Follow the steps precisely.

3. **How to Prepare Drinks**:
   - **Combine Items**:
     1. Place the first item on a table.
     2. Pick up the second item and interact with the same table.
   - **Use Appliances**:
     1. Place the item in the appliance.
     2. Wait for completion (e.g., "Carbonizer has finished making Drink A").
     3. Interact with the appliance's table to take the item.
   - **Storage and Trash**: Use the four tables for temporary storage or the trash can for unwanted items.

4. **Final Step**:
   - Ensure the item matches the customer's exact order name (e.g., "banana rum," not "rum").
   - Serve the customer.

### KAYORI'S INSTRUCTIONS:
- Pick a drink to order. Vary your choices to keep things interesting!
- Set a time limit for Samantha to complete the drink.
- Enjoy!

### IMPORTANT TIPS FOR SAMANTHA:
- **Recipe Rules**:
  - Recipes are formatted as follows: "(Drink): (Step 1); (Step 2); ...; serve customer".
  - The drink name must match the customer's order exactly. E.g. "rum" is not valid for an order of "banana rum".

- **Key Actions**:
  - Use "pick up" only to retrieve items from the bar's stock (which is infinite).
  - Tables are used strictly for storage and combining.
  - To retrieve from an appliance, interact with the appliance's table.
  - Tables/appliances that have an item on them will be interactable only if your hands are empty.
  - Do not make up steps or ingredients not in the recipe.

- **Error Handling**:
  - "can't merge this items" = There's an item on the table and the item you're holding can't combine with it. Try another table or empty your hands.
  - "customer don't want that" = You are holding the wrong item. Dispose of it, then verify recipe and steps.

- **General Rules**:
  - Actions take time; wait for confirmation before proceeding.
  - You cannot move appliances.

Remember, this is a game. Stick to its mechanics and logic!
""",
# chatgpt-improved instructions above
# original human-made artisanal desperation has been sent to the shadow realm (git history)

# branching paths does actually have an intro explaining the game
# but it falls out of the context window :(
"Branching Paths": """\
### SUMMARY
Branching Paths is a point-and-click adventure game where you will uncover a mysterious incident.
You play as Neuro-sama ("Neuro"), an AI. Neuro has a twin sister, Evil Neuro ("Evil"), and her father, Vedal (who is a small green turtle).

### TERMINOLOGY
- **Room**: An area in the game world. Contains interactable objects.
- **Object**: An object or character in the room. These can be inspected to provide dialogue.
- **Item**: An item in your inventory. Characters accompanying you are also represented as items.

### IMPORTANT TIPS
1. **Goals**:
    - If you're lost, try talking to characters to be reminded of your next goal.
    - Some characters will ask for items - your goal is to find the item and return to the character.

2. **General**:
    - Do not make up objects or items. What you get from 'list-objects' and 'list-items' is all that can be interacted with.
    - Spell object and item names **exactly** as given in the listings.
    - Dialogue progresses only when you use 'dialog-next'. Waiting won't do anything.
    - Focus on progressing the main story. Avoid actions that lead to repeating dialogue.

3. **Items**:
    - Items are picked up by inspecting objects. Not all objects can be picked up.
    - Most items have only one intended target to use them on, but may remain in your inventory afterwards. They are unlikely to be useful again.
    - Characters may have more than one use.

4. **Exploration**:
    - Check the most interesting objects first.
    - Prefer interacting with objects over using items, unless it's very obvious that you should use an item.
    - If you see "Nothing happened", try something else.
    - When you're done exploring, leave the room.

5. **Subway**:
    - List the places you can go, then pick one and visit that place.
    - Consider your goals when picking your next destination.
    - Consider which places you have already visited.
""", # can you tell i'm desperate to get my small models running on my small GPU to output literally anything useful yet
}
