from enum import IntFlag, unique
from typing import * # type: ignore
from logging import * # type: ignore

_path = "_models/bartowski_Phi-3.1-mini-128k-instruct-Q6_K_L.gguf"
# _path = "_models/bartowski_Meta-Llama-3.1-8B-Instruct-Q5_K_L.gguf"
MODEL_PATH = _path
MODEL_API_KEY = ""
MODEL_TEMPERATURE = 10
MODEL_CTX_LENGTH = 8192

@unique
class LLMConfig(IntFlag):
    OBEY_FORCE = 1
    TRY_ON_REGISTER = 2
    SCHEDULE_ACT = 4
    SCHEDULE_YAP = 8
    FULL_SIM = OBEY_FORCE | TRY_ON_REGISTER | SCHEDULE_ACT | SCHEDULE_YAP

LLM_FLAGS: LLMConfig = LLMConfig.OBEY_FORCE | LLMConfig.TRY_ON_REGISTER

ENABLE_COT = False
'''
Enable poor man's chain-of-thought.
In my testing, this just consumes a bunch more tokens without a tangible difference.
'''

LOG_LEVEL_CONSOLE = DEBUG
LOG_LEVEL_FILE = INFO

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
- When the customer arrives, prepare their order.
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
