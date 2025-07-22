import os, dotenv, yaml, argparse
import importlib.util

from enum import Enum
from os import environ
from typing import Any, Literal
from pydantic import BaseModel, NonNegativeInt

# pull out to cli module? (10 lines...)
parser = argparse.ArgumentParser()
parser.add_argument("--config", help="Path to config file (default: 'config.yaml')", default=None)
parser.add_argument("--preset", help="Preset from config file to use (default: 'default')", default=None)
args = parser.parse_args()
env_path = dotenv.find_dotenv()
if env_path and os.path.exists(env_path):
    dotenv.load_dotenv(env_path, override=True)
CONFIG_PATH = args.config or environ.get("GARY_CONFIG_FILE", "config.yaml")
PRESET = args.preset or environ.get("GARY_CONFIG_PRESET", "default")

class ConflictResolutionPolicy(Enum):
    DROP_INCOMING = 'drop_incoming'
    DROP_EXISTING = 'drop_existing'

_LogLevel = Literal['all', 'trace', 'debug', 'info', 'success', 'warning', 'error', 'critical', 'none'] | NonNegativeInt
class Config(BaseModel):
    class LLMConfig(BaseModel):
        engine: Literal[
            'llama_cpp', 'transformers',
            'randy',
            # 'openai', 'anthropic', 'azure_openai', 'googleai',
            # 'guidance_server',
        ]
        model: str
        api_key: str = ""
    class GaryConfig(BaseModel):
        class SchedulerConfig(BaseModel):
            idle_timeout_try: float = 5.0
            '''If the model does not act for this many seconds, manually ask it to act (it may decide not to).'''
            idle_timeout_force: float = 30.0
            '''If the model does not act for this many seconds, force it to pick an action to perform.'''
            sleep_after_say: bool = False
            '''Sleep after saying something to simulate waiting for TTS.'''
        class LoggingConfig(BaseModel):
            log_level_file: _LogLevel = 'info'
            log_level_console: _LogLevel = 'info'
            modules: dict[str, _LogLevel] = {
                'gary.llm.scheduler': 'warning',
                'gary.llm.llm': 'info',
                'gary.web': 'info',
            }
        logging: LoggingConfig = LoggingConfig()
        existing_connection_policy: ConflictResolutionPolicy = ConflictResolutionPolicy.DROP_EXISTING
        '''What to do when someone tries to connect to a game that already has an active connection.'''
        existing_action_policy: ConflictResolutionPolicy | None = ConflictResolutionPolicy.DROP_EXISTING
        '''
        [DEPRECATED] What to do when an action is registered but there's already an action with that name.
        When v2 is out, this will be handled based on the API version (v1 ignores incoming and v2 overwrites, as per spec).
        '''
        allow_yapping: bool = False
        '''
        Allow the model to choose to say something instead of performing an action.
        Eats through tokens, likely to distract the model. Only enable this for "realism".
        '''
        scheduler: SchedulerConfig = SchedulerConfig()
        enforce_schema: bool = True
        '''
        Enforce action schemas when generating data JSON.
        Turn this off if you:
            - Want to test how the game responds to invalid JSON and are too lazy to send invalid actions manually (through the web UI)
            - Want to see how good the model is at outputting JSON for some reason
        '''
    api: dict[str, Any] = {}
    llm: LLMConfig
    engine_params: dict[str, Any] = {}
    gary: GaryConfig = GaryConfig()

def _merge_nested_dicts(a: dict | None, b: dict | None):
    if not a:
        if not b:
            raise ValueError("Nothing to merge")
        return b
    if not b:
        return a
    out = dict(a)
    for k, bv in b.items():
        if isinstance(bv, dict):
            out[k] = _merge_nested_dicts(a.get(k), bv)
        else:
            out[k] = bv
    return out

def _load_config(preset_name: str, config_yaml: dict[str, dict]):
    if not (preset := config_yaml.get(preset_name)):
        raise ValueError(f"Preset '{preset_name}' was not found in config.yaml")
    if base := preset.get('base'):
        if base not in config_yaml:
            raise ValueError(f"Base preset '{base}' (referenced in '{preset_name}') was not found in config.yaml")
        base_preset = _load_config(base, config_yaml)
        preset = _merge_nested_dicts(base_preset, preset['overrides'])

    def replace_env(d: dict) -> dict:
        out = {}
        for k, v in d.items():
            out[k] = replace_env(v) if isinstance(v, dict)\
                else environ.get(v[5:], v) if isinstance(v, str) and v.startswith("$ENV:")\
                else v
        return out

    preset = replace_env(preset)
    # print(f"{preset_name=}\n{preset=}")
    return preset

_config_yaml: dict
with open(CONFIG_PATH) as f:
    _config_yaml = yaml.safe_load(f)
CONFIG = Config(**_load_config(PRESET, _config_yaml))

def validate_config(config: Config):
    match config.llm.engine:
        case 'llama_cpp':
            if not os.path.exists(config.llm.model):
                raise ValueError(f"Model file '{config.llm.model}' not found")
        case 'transformers':
            if not any(importlib.util.find_spec(package) for package in ('torch', 'transformers', 'accelerate')):
                raise ValueError("transformers engine requires extra dependencies - please run `uv sync --extra transformers`")

validate_config(CONFIG)
