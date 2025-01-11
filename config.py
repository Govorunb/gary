from enum import Enum
import dotenv, yaml, argparse
from os import environ
from typing import * # type: ignore
from pydantic import BaseModel

parser = argparse.ArgumentParser()
parser.add_argument("--preset", default="default", help="Preset from config.yaml to use")
args = parser.parse_args()
dotenv.load_dotenv(".env", override=True)

class ExistingConnectionPolicy(Enum):
    DISCONNECT_NEW = "disconnect_new"
    DISCONNECT_EXISTING = "disconnect_existing"

_LogLevel = Literal["all", "debug", "info", "warn", "warning", "error", "critical", "fatal", "none"] | int
class Config(BaseModel):
    class LLMConfig(BaseModel):
        engine: Literal["openai", "anthropic", "azure_openai", "googleai", "transformers", "llama_cpp", "guidance_server"]
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
    with open("config.yaml") as f:
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

CONFIG = Config(**_load_config(args.preset))

# temp i guess
# these are always kept in the context
# otherwise phi is too dumb to do anything
MANUAL_RULES = {
    # the real question is, is it phi that's stupid or is it actually me
    "Abandoned Pub": """\
RULES:
The game features an AI bartender named Samantha. Her job is to wait for customers to arrive, and then serve their orders.
Some drinks can be simply picked up from storage, and some require following a recipe (available in the recipe book).
Samantha can combine items to make others by interacting with a table while holding an item. Some combinations require using specific appliances.
Samantha can only hold one item in her hands, but she has four tables available to her as storage space. She can also throw unwanted items in the trash can.
You will play as either Samantha (the bartender) or Kayori (a customer).

INSTRUCTIONS (Samantha):
- Wait for a customer to arrive before performing any actions.
- When the customer arrives, prepare their order:
    - If they want something that's available in storage, just pick it up and then serve it.
    - Otherwise, the drink must require combining items. Check the recipe book for the drink they want.
        - Recipes are formatted as follows: "(Drink): (Step 1); (Step 2); ...; serve customer".
    - Prepare the drink:
        - Take ingredients from storage.
        - Follow the recipe order carefully to make the drink.
            - To combine two items, one of them must be on a table. Interact with that table with the second item in your hands.
            - To process an item in an appliance, interact with it with an item in your hands.
                - Wait for the appliance to process the item.
                - When the appliance is done, take the item from that appliance by interacting with its table again.
        - If the recipe has multiple steps, use tables to store intermediate steps.
- Serve the drink to the customer.
- After serving the current customer, wait for the next customer to arrive.

INSTRUCTIONS (Kayori):
- Pick a drink to order. Order different drinks to keep the game interesting!
- Pick the time limit for Samantha to make the drink.
- Enjoy!

TIPS (Samantha):
The recipe book will show the recipe for the latest customer's drink. For example, "Drink A: carbonate item 1; serve customer" means:
    - Pick up "item 1" from storage
    - Put it in the carbonizer
    - Wait for carbonizer to be done (the game will say "Carbonizer has finished making Drink A")
    - Interact with carbonizer again to take the carbonated item 1. DO NOT use 'pick up' UNDER ANY CIRCUMSTANCES.
    - Serve customer
If you just served a customer, the recipe will be outdated and should not be used. Just wait for the next customer.
To combine two items (e.g. if the recipe asks for "rum and banana"):
    - Obtain the first item and take it into your hands
    - Interact with a table to store the first item
    - Obtain the second item and take it into your hands
    - Interact with the table on which you stored the first item
The tables are all behind the bar and are not customer tables. They are item storage. Placing an item on one does not serve the customer.
Follow the recipe EXACTLY. For example:
    - if the recipe calls for "chat juice", "raw chat juice" is not acceptable.
    - If the drink name is "Banana rum", you CANNOT serve just "rum" and you CANNOT serve just "banana".
Keep your reasoning short. Do not skip steps. If the game doesn't inform you that a step has been completed, assume it hasn't and you need to do it.
Pay attention to what the game tells you after you execute an action. For example:
    - If you can't pick something up, it means you are already holding something else. Put it down on a table or throw it in the trash can.
    - "can't merge this items" means that the table already has an item it, and it does not combine with what you're holding. Use another table or throw away the item.
    - If you try to serve a customer and the game says "customer don't want that", you must be holding the wrong item.
    - Think about what you are holding. Have you recently picked up an item? Have you recently placed one on a table somewhere?
    - Make sure you are following the recipe.
This is a simple game, you can only do what the game allows you to do. For example:
    - You cannot pick up a glass, as it's not a valid item.
    - The customers are not real. They do not talk, and they do not have feelings or opinions.
    - You can only perform one action at a time, and actions take time. WAIT for the result of your action (e.g. '[item] picked up' or '[appliance] has finished making [item]') before proceeding to the next step.
    - Unless the game explicitly tells you that something happened, it didn't.
    - DO NOT use the term 'pick up' to refer to taking items from appliances, as 'pick up' is a completely different action.
    - To take an item from an appliance, you have to use 'interact with table'.
    - If the 'serve customer' action is available, it means there is a customer waiting for their drink.
    - If the 'pick up' action is available, it means you are NOT holding an item.
    - If you're not holding anything and you can interact with a table or appliance, it means there is something on that table/in that appliance. Try taking it to see if it's something you want.
    - You cannot pick up or move appliances, they are static.
    - If what you're holding is not named EXACTLY the same as the customer's order, the customer WILL NOT accept it.
    - At the final step of the recipe, the ingredient is transformed into the drink whose name is in the beginning of the recipe.
If you're lost, refer back to the INSTRUCTIONS and go through the checklist.
""", # fml
}
