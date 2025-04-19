from contextlib import AbstractContextManager, contextmanager
import random, time
from orjson import dumps
from typing import TYPE_CHECKING, NamedTuple, Self
from pydantic import TypeAdapter
from loguru import logger

import llama_cpp
from guidance.models._engine import Engine
from guidance import gen, with_temperature, select, json, models, system, user, assistant
from guidance.chat import Llama3ChatTemplate, Phi3MiniChatTemplate
from guidance._grammar import Function


from ..util import CONFIG, HasEvents, json_schema_filter, loguru_tag
from ..util.config import MANUAL_RULES
from ..spec import *

from .randy import Randy
from .llarry import Llarry, StreamingLlamaCppEngine
if TYPE_CHECKING:
    from ..registry import Game

# IMPL: this whole file (for obvious reasons)

# pyright: reportPrivateImportUsage=false

(ACT, SAY, WAIT) = ('action', 'say', 'wait')

SENDER_SYSTEM = 'SYSTEM'
SENDER_HUMAN = 'USER'

class Act(NamedTuple):
    name: str
    data: str | None

class ModelWrapper:
    def __init__(self, model: models.Model):
        self.model = model

    def __str__(self):
        return str(self.model)

    def __getitem__(self, key: str):
        return self.model[key]

    def __add__(self, other: str | Function) -> Self:
        self.model += other
        return self
    
    def __iadd__(self, other: str | Function) -> Self:
        return self.__add__(other)

    @contextmanager
    def role(self, ctxmgr: AbstractContextManager):
        with ctxmgr:
            yield self
        # adding anything after the context manager will close the role
        # why it has to be done this way is a long story
        self += ""

class LLM(HasEvents[Literal['context', 'say']]):
    llm: models.Model
    token_limit: int
    temperature: float
    rules: str | None

    def __init__(self, game: "Game"):
        super().__init__()
        self.game = game
        self._warned_filtered_schemas = set()
        logger.info(f"loading model for {game.name}")
        start = time.time()
        llm_config = CONFIG.llm
        engine = llm_config.engine
        model = llm_config.model

        params: dict[str, Any] = {
            "api_key": llm_config.api_key,
            "seed": random.randint(1, 2**32 - 1),
            "chat_template": (
                # why is this not picked up automatically orz
                Llama3ChatTemplate if 'Llama-3.1' in model
                else Phi3MiniChatTemplate if 'Phi-3.' in model
                else None),
            "enable_monitoring": False,
            **CONFIG.engine_params
        }
                
        if engine == "llama_cpp":
            self.llm = Llarry(model, echo=False, **params)
        elif engine == "transformers":
            self.llm = models.Transformers(model, echo=False, **params)
        elif engine == "randy":
            self.llm = Randy(model, echo=False, **params)
        elif engine in ("openai", "anthropic", "azure_openai", "vertexai"):
            raise ValueError(f"Remote services are not supported: {engine}")
        else:
            raise ValueError(f"Unknown engine type: {engine}")
        
        self.token_limit = params.get("n_ctx", 1 << 32) - 200
        self.llm.echo = False
        end = time.time()
        logger.debug(f"loaded in {end-start:.2f} seconds")
        self.temperature = params.get("temperature", 1.0)
    
    @classmethod
    async def create(cls, game: "Game"):
        llm = cls(game)
        await llm.system_prompt()
        return llm

    async def system_prompt(self):
        sys_prompt = """\
You are Gary, an expert gamer AI. Your main purpose is playing games. You perform in-game actions via sending JSON to a special software integration system.
You are goal-oriented but curious. You aim to keep your actions varied and entertaining."""
        if CONFIG.gary.allow_yapping:
            sys_prompt += "\nYou can choose to 'say' something, whether to communicate with the user running your software or just to think out loud."
            sys_prompt += "\nRemember that your only means of interacting with the game is 'action'. In-game characters cannot hear you."
        logger.trace(f"System prompt: {sys_prompt}")
        with self.system() as lm:
            lm += sys_prompt
        self.llm = lm.model
        # no role closer here is surely fine
        if custom_rules := MANUAL_RULES.get(self.game.name):
            logger.debug(f"Found custom rules for {self.game.name}")
            await self.context(custom_rules, self.game.name, silent=True, persistent_llarry_only=True, notify=False)

    def llm_engine(self) -> Engine:
        return self.llm._client.engine # type: ignore

    def max_tokens(self, at_most: int = 100000) -> int:
        maxtok = max(0, min(at_most, self.token_limit - tokens(self.llm)))
        logger.debug(f"Max tokens: {maxtok}")
        return maxtok

    async def reset(self, llarry_keep_persistent=False):
        engine = self.llm_engine()
        if llarry_keep_persistent and isinstance(self.llm, Llarry):
            logger.debug("TODO: keep persistent messages on reset")
            self.llm.persistent.clear()
        if isinstance(engine, models._llama_cpp.LlamaCppEngine):
            engine.reset_metrics()
            engine.model_obj.reset()
            llama_cpp.llama_kv_cache_clear(engine.model_obj.ctx)

        # :) all this to avoid the model.LlamaCpp ctor
        # it sure is nice that python lets you do this :)
        buh = models.Model(self.llm._client, self.llm._state.__class__(), echo=False)
        if isinstance(self.llm, Llarry):
            buh.__class__ = Llarry
            buh.persistent = self.llm.persistent.copy() # type: ignore
        self.llm = buh

        assert self.llm.token_count == 0
        assert len(str(self.llm)) == 0
        logger.debug(f'truncated context to {tokens(self.llm)}')

        await self.system_prompt()
        if self.game.connection and self.game.connection.is_connected():
            await self.gaming()

    async def gaming(self):
        await self.context(f"Connected. You are now playing {self.game.name}", SENDER_SYSTEM, silent=True)

    async def not_gaming(self):
        await self.context(f"Disconnected from {self.game.name}.", SENDER_SYSTEM, silent=True)

    async def context(self,
        ctx: str,
        sender: str,
        *,
        silent: bool = False,
        ephemeral: bool = False,
        do_print: bool = True,
        persistent_llarry_only: bool = False,
        notify: bool = True
    ) -> models.Model:
        # TODO: options for decorating the message
        # so try/force_action prompts (or manual send from webui) don't appear as though they come from the game
        msg = f"[{sender}] {ctx}"
        tokens = len(self.llm_engine().tokenizer.encode(msg.encode()))
        await self.truncate_context(tokens)
        with self.user() as lm:
            lm += msg + "\n"
        out = lm.model
        if do_print:
            log_msg = msg.replace("<", r"\<")
            decorations = {
                'dim': silent,
                'strike': ephemeral,
                'italic': persistent_llarry_only,
            }
            for tag in filter(lambda k: decorations[k], decorations):
                log_msg = loguru_tag(log_msg, tag)
            logger.opt(colors=True).info(log_msg)
            if tokens > 500 and not persistent_llarry_only:
                logger.warning(f"Context '{ctx[:20].encode('unicode_escape').decode()}...' had {tokens} tokens. Are you sure this is a good idea?")
        if persistent_llarry_only and isinstance(out, Llarry):
            i = sum(1 for _ in out.iter_messages_tokens())-1 # woooow no builtin to count an iterator so pythonic
            logger.debug(f"Marking message {i} as persistent (current: {out.persistent})")
            out.persistent.add(i)
        if notify:
            await self._raise_event('context', ctx, sender, silent, ephemeral)
        if not ephemeral:
            self.llm = out
        return out

    async def force_action(self, msg: ForceAction) -> Act | None:
        if not self.game.actions:
            logger.error("No actions to choose from (LLM.force_action)")
            return None
        assert self.game.name == msg.game, f"Received ForceAction for game {msg.game} while this LLM is for {self.game.name}"
        ephemeral = msg.data.ephemeral_context or False
        actions = [self.game.actions[name] for name in msg.data.action_names if name in self.game.actions]
        if len(msg.data.action_names) != len(actions):
            logger.warning(f"ForceAction contains unknown action names: {set(msg.data.action_names) - set(a.name for a in actions)}")
        actions_json = (TypeAdapter(list[ActionModel])
            .dump_json(actions, by_alias=True)
            .decode())
        # FIXME: omit "query"/"state" if empty
        # FIXME: unicode escape
        ctx_msg = f"""
You must perform one of the following actions, given this information:
```json
{{
    "query": "{msg.data.query}",
    "state": "{msg.data.state}",
    "available_actions": {actions_json}
}}
```
"""
        # self.action doesn't take a model param, so ephemerality here is done by setting/resetting self.llm
        # relies on immutability of model objects
        llm_ephemeral_restore = self.llm
        self.llm = await self.context(ctx_msg, SENDER_SYSTEM, silent=True, ephemeral=ephemeral, do_print=False, notify=True)
        act = await self.action(actions, ephemeral=ephemeral)
        if ephemeral:
            self.llm = llm_ephemeral_restore
        return act

    async def action(self, actions: list[ActionModel], *, ephemeral: bool = False) -> Act:
        if not actions:
            raise Exception("No actions to choose from (LLM.action)")
        await self.truncate_context(200)
        with self.assistant() as llm:
            llm += f'''\
```json
{{
    "command": "action",
    "action_name": "{with_temperature(select([a.name for a in actions], "action_name"), self.temperature)}",'''
            action_name = llm["action_name"]
            chosen_action = next(a for a in actions if a.name == action_name)
            schema = chosen_action.schema_
            llm += f'''
    "schema": {dumps(schema).decode()},'''
            if not CONFIG.gary.enforce_schema:
                schema = None
            try:
                json_gen = json("data", schema=schema, temperature=self.temperature, max_tokens=self.max_tokens())
            except ValueError as e:
                if 'Unimplemented keys: ["' not in e.args[0]:
                    raise
                logger.debug(e.args[0])
                (filtered_schema, filtered_keys) = json_schema_filter(schema)
                if filtered_keys and chosen_action.name not in self._warned_filtered_schemas:
                    self._warned_filtered_schemas.add(chosen_action.name)
                    logger.warning(f"Schema for action '{action_name}' contains unsupported keywords {filtered_keys}. They cannot be enforced, so the model may generate JSON that does not comply.")
                json_gen = json("data", schema=filtered_schema, temperature=self.temperature, max_tokens=self.max_tokens())
            time_gen(llm, f'''
    "data": {json_gen}
}}
```''')
        data = llm['data']
        logger.debug(f"chosen action: {action_name}; data: {data}")
        if not ephemeral:
            self.llm = llm.model
        return Act(action_name, data)

    async def try_action(self, actions: list[ActionModel], allow_yapping: bool = True) -> Act | None:
        if isinstance(self.llm, Randy):
            allow_yapping = False # no thank you

        await self.truncate_context(1000 if allow_yapping else 500) # leave room for action() afterwards
        if not actions and not allow_yapping:
            logger.info("No actions to choose from (LLM.try_action)")
            return None
        ctx = "Decide what to do next based on previous context."
        if actions:
            actions_json = (TypeAdapter(list[ActionModel])
                .dump_json(actions, by_alias=True)
                .decode()
                .replace("\n", "\n    "))
            ctx += f"""
The following actions are available to you:
```json
{{
    "available_actions": {actions_json}
}}
```"""
        options_map = {
            ACT: bool(actions),
            SAY: allow_yapping,
            WAIT: True,
        }
        options = [key for key, value in options_map.items() if value]
        if len(options) > 1:
            ctx += f"\nRespond with one of these options: {options}"
        pre_resp = await self.context(ctx, SENDER_SYSTEM, silent=True, ephemeral=True, do_print=False, notify=False)
        resp = f'''
```json
{{
    "command": "{with_temperature(select(options, 'decision'), self.temperature)}"'''
        with self.assistant(pre_resp) as llm:
            time_gen(llm, resp)
            decision = llm['decision']
            logger.info(f"{decision=}")
            llm += """
}
```"""
        # TODO: command handlers
        if decision == ACT:
            return await self.action(actions)
        elif decision == SAY:
            # if not persisted, the next generation is as if the model never spoke
            # so it just repeats itself until the scheduler forces an action
            # TODO: persist only the actual decision
            # e.g. remove "available_actions" prompt, "schema" reminder after picking action, etc
            # TODO: append after "command": "select(options)" directly instead of this weird generate-then-discard-then-forward-what-was-generated thing
            await self.say(pre_resp)
            return None
        elif decision == WAIT:
            return None
        logger.error(f"unhandled decision '{decision}'")
        return None

    async def say(self, model: models.Model | None = None, message: str | None = None, ephemeral: bool = False) -> ModelWrapper:
        await self.truncate_context(520)
        model = model or self.llm

        msg = message or gen('say', stop=['\n','"'], temperature=self.temperature, max_tokens=self.max_tokens(500))
        
        gen_ = f'''
```json
{{
    "command": "say",
    "message": "{msg}"
}}
```'''
        with self.assistant(model) as llm:
            time_gen(llm, gen_)
        said = llm['say']
        logger.opt(colors=True).success(f"> <lc>{said}</>")
        # for msg in cast(Llarry, llm).iter_messages_text()[-3:]:
        #     _logger.debug(f"{msg}\n\n{msg.encode()}")
        await self._raise_event('say', said)
        if not ephemeral:
            self.llm = llm.model
        return llm

    async def truncate_context(self, need_tokens: int = 0):
        assert need_tokens >= 0
        # TODO: model arg

        token_count = tokens(self.llm)
        used = token_count + need_tokens
        msg = f"Currently at {used}/{self.token_limit} tokens"
        if need_tokens > 0:
            msg += f" (using {token_count}, need {need_tokens} more)"
        logger.debug(msg)
        if used > self.token_limit:
            if isinstance(self.llm, Llarry) and isinstance(self.llm_engine(), StreamingLlamaCppEngine):
                logger.info(f"Trimming context ({used}/{self.token_limit} tokens used)")
                self.llm = self.llm.trim()
            else:
                logger.info(f"Truncating context ({used}/{self.token_limit} tokens used)")
                await self.reset()
    
    def system(self, lm = None):
        return ModelWrapper(lm or self.llm).role(system()) # type: ignore # great... now they're lying about what types they return
    def user(self, lm = None):
        return ModelWrapper(lm or self.llm).role(user()) # type: ignore
    def assistant(self, lm = None):
        return ModelWrapper(lm or self.llm).role(assistant()) # type: ignore

    def dump(self, lm = None):
        return str(lm or self.llm)

def tokens(m: models.Model, s: str | None = None) -> int:
    s = s or str(m)
    return len(m.engine.tokenizer.encode(s.encode())) # type: ignore

def time_gen(lm: ModelWrapper, gen_: Function | str):
    engine: Engine = lm.model._client.engine # type: ignore
    prev_tok_out: int = lm.model.token_count
    prev_tok_in: int = len(engine.tokenizer.encode(str(lm.model._state).encode()))
    t0 = time.perf_counter()
    lm += gen_
    generation_took = time.perf_counter() - t0
    new_tok_in: int = len(engine.tokenizer.encode(str(lm.model._state).encode()))
    new_tok_out: int = lm.model.token_count
    delta_tok_in: int = new_tok_in - prev_tok_in
    delta_tok_out: int = new_tok_out - prev_tok_out
    tps: float = delta_tok_out / generation_took
    logger.debug(
        f'input {delta_tok_in} and output {delta_tok_out} tokens in {generation_took:.2f}s'
        + (f' ({tps:.2f} tok/s)' if tps != 0 else '')
    )
    return lm
