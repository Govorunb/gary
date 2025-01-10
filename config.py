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
        Don't discard context from picking whether to act or not.
        If try_action happens to generate good reasoning, this will help. If your model hallucinates a lot, it will very much not help.
        You should play around with this.
        '''
        # will probably be obsoleted by the scheduler if i get around to making it
        try_on_register: bool = True
        '''On receiving `actions/register`, try to act immediately.'''
    fastapi: dict[str, Any] = {}
    llm: LLMConfig
    engine_params: dict[str, Any] = {}
    gary: GaryConfig

def _load_config(preset_name: str):
    with open("config.yaml") as f:
        config_yaml: dict = yaml.safe_load(f)
    preset: dict
    if not (preset := config_yaml.get(preset_name, None)):
        raise ValueError(f"Preset '{preset_name}' was not found in config.yaml")
    if base := preset.get("base", None):
        if not (base_preset := config_yaml.get(base, None)):
            raise ValueError(f"Base preset '{base}' (from '{preset_name}') was not found in config.yaml")
        preset = {**base_preset, **preset["overrides"]}

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
Some drinks can be simply picked up from storage and served directly, and some require following a recipe (available in the recipe book).
Samantha can combine items to make others by interacting with a table while holding an item. Some combinations require using specific appliances.
Samantha can only hold one item in her hands, but she has four tables available to her as storage space. She can also throw unwanted items in the trash can.
You will play as either Samantha (the bartender) or Kayori (a customer).

INSTRUCTIONS (Samantha):
- Wait for a customer to arrive before performing any actions.
- When the customer arrives, prepare their order:
    - If they want something that's available in storage, pick it up and serve immediately.
    - Check the recipe book for the drink they want.
    - Prepare the drink - take ingredients from storage and combine them to make the drink. Follow the recipe order carefully.
- Serve the drink to the customer.
- After serving the current customer, wait for the next customer to arrive.

INSTRUCTIONS (Kayori):
- Pick a drink to order. Order different drinks to keep the game interesting!
- Pick the time limit for Samantha to make the drink.
- Enjoy!

TIPS (Samantha):
The recipe book will show the recipe for the latest customer. If you just served a customer, the recipe will be outdated and should not be used. Just wait for the next customer.
Follow the recipe exactly - for example, if the recipe says "pick up vodka from storage; serve customer", you don't need a glass.
Some recipes require combining items multiple times - you will need to use the tables to temporarily store ingredients!
If picking up items is not available, it means you are already holding something else.
If you try to serve a customer and the game says "customer don't want that", you must be holding the wrong item. Free up your hands then try again.
""",
}
