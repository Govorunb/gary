import asyncio
import random, time
from orjson import dumps
from datetime import datetime
from typing import TYPE_CHECKING, cast
from pydantic import TypeAdapter

import llama_cpp
from guidance import gen, with_temperature, select, json, models, system, user, assistant
from guidance.chat import Llama3ChatTemplate, Phi3MiniChatTemplate
from guidance._grammar import Function


from ..util import CONFIG, logger, HasEvents
from ..util.config import MANUAL_RULES
from ..spec import *

from .randy import Randy
from .llarry import Llarry, StreamingLlamaCppEngine
if TYPE_CHECKING:
    from ..registry import Game

# IMPL: this whole file is my implementation since uhh... yeah

# pyright: reportPrivateImportUsage=false

# pyright: reportOperatorIssue=false
# __add__ without an explicit __iadd__ impl surely means you cannot use +=. it is illegal and your code will explode

_engine_map = {
    # "openai": models.OpenAI,
    # "anthropic": models.Anthropic,
    # "azure_openai": models.AzureOpenAI,
    # "googleai": models.GoogleAI,
    "llama_cpp": Llarry,
    "transformers": models.Transformers,
    "guidance_server": models.Model,
    "randy": Randy,
}

class LLM(HasEvents[Literal['context', 'say']]):
    llm: models.Model
    token_limit: int
    temperature: float
    rules: str | None

    def __init__(self, game: "Game"):
        super().__init__()
        self.game = game
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
        model_cls = _engine_map[engine]

        self.llm = model_cls(model, echo=False, **params) # type: ignore
        self.token_limit = params.get("n_ctx", 1 << 32) - 200
        self.llm.echo = False
        end = time.time()
        logger.info(f"loaded in {end-start:.2f} seconds")
        asyncio.create_task(self.system_prompt())
        self.temperature = params.get("temperature", 1.0)

    async def system_prompt(self):
        sys_prompt = """\
You are Larry, an expert gamer AI. You have a deep knowledge and masterfully honed ability to perform in-game actions via sending JSON to a special software integration system called Gary.
You are goal-oriented but curious. You aim to keep your actions varied and entertaining."""
        if CONFIG.gary.enable_cot:
            sys_prompt += " Keep your reasoning short and to the point."
        if CONFIG.gary.allow_yapping:
            sys_prompt += "\nYour only means of interacting with the game is through actions. You can also choose to 'say' something out loud. In-game characters cannot hear you."
        with system():
            self.llm += sys_prompt
        if custom_rules := MANUAL_RULES.get(self.game.name):
            await self.context(custom_rules, silent=True, persistent_llarry_only=True, notify=False)

    def llm_engine(self) -> models._model.Engine:
        return self.llm.engine # type: ignore

    def max_tokens(self, at_most: int = 100000) -> int:
        maxtok = max(0, min(at_most, self.token_limit - tokens(self.llm)))
        logger.debug(f"Max tokens: {maxtok}")
        return maxtok

    async def reset(self, llarry_keep_persistent=False):
        engine = self.llm_engine()
        if llarry_keep_persistent and isinstance(self.llm, Llarry):
            logger.debug("TODO: keep persistent messages on reset")
        if isinstance(engine, models.llama_cpp._llama_cpp.LlamaCppEngine):
            engine.reset_metrics()
            engine.model_obj.reset()
            llama_cpp.llama_kv_cache_clear(engine.model_obj.ctx)

        # :) all this to avoid the model.LlamaCpp ctor
        # it sure is nice that python lets you do this :)
        buh = models.Model(self.llm.engine, echo=False)
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
        await self.context(f"Connected. You are now playing {self.game.name}", silent=True)

    async def not_gaming(self):
        await self.context("Disconnected.", silent=True)

    async def context(self, ctx: str, silent: bool = False, *, ephemeral: bool = False, do_print: bool = True, persistent_llarry_only: bool = False, notify: bool = True) -> models.Model:
        msg = f"[{self.game.name}] {ctx}"
        if True: # yes i'm manually flipping this in code, i can't decide if it's a waste of tokens or not
            msg = f"[{datetime.now().strftime('%H:%M:%S')}] " + msg
        tokens = len(self.llm_engine().tokenizer.encode(msg.encode()))
        await self.truncate_context(tokens)
        with user():
            out = cast(models.Model, self.llm + msg + "\n") # pyright infers NoReturn (literally how???)
        out += "" # add anything after the context manager exits so guidance can add the role closer
        if do_print:
            prefix = ""
            if silent:
                prefix += "S"
            if ephemeral:
                prefix += "E"
            if persistent_llarry_only:
                prefix += "P"
            if prefix:
                prefix = " " + prefix
            logger.info(f"(ctx{prefix}) {msg}")
            if tokens > 500 and not persistent_llarry_only:
                logger.warning(f"Context '{ctx[:20].encode('unicode_escape').decode()}...' had {tokens} tokens. Are you sure this is a good idea?")
        if persistent_llarry_only and isinstance(out, Llarry):
            i = sum(1 for _ in out.iter_messages())-1 # woooow no builtin to count an iterator so pythonic
            logger.debug(f"Marking message {i} as persistent (current: {out.persistent})")
            out.persistent.add(i)
        if notify:
            await self._raise_event('context', ctx, silent, ephemeral)
        if not ephemeral:
            self.llm = out
        return out

    async def force_action(self, msg: ForceAction, actions: dict[str, ActionModel]) -> tuple[str, str] | None:
        if not actions:
            logger.error("No actions to choose from (LLM.force_action)")
            return None
        assert self.game.name == msg.game, f"Received ForceAction for game {msg.game} while this LLM is for {self.game.name}"
        ephemeral = msg.data.ephemeral_context or False
        actions_for_json = [actions[name] for name in msg.data.action_names if name in actions]
        if len(msg.data.action_names) != len(actions_for_json):
            logger.warning(f"ForceAction contains unknown action names: {set(msg.data.action_names) - set(actions)}")
        actions_json = (TypeAdapter(list[ActionModel])
            # .dump_json(actions_for_json, indent=4)
            .dump_json(actions_for_json)
            .decode()
            .replace("\n", "\n    "))
        await self.context(f"""
You must perform one of the following actions, given this information:
```json
{{
    "query": "{msg.data.query}",
    "state": "{msg.data.state}",
    "available_actions": {actions_json}
}}
```
""",
        silent=True, ephemeral=ephemeral, do_print=False, notify=False)
        return await self.action(actions, ephemeral=ephemeral)

    async def action(self, actions: dict[str, ActionModel], *, ephemeral: bool = False) -> tuple[str, str]:
        if not actions:
            raise Exception("No actions to choose from (LLM.action)")
        await self.truncate_context(500 if CONFIG.gary.enable_cot else 150)
        llm = self.llm
        with assistant():
            llm += f'''\
```json
{{
    "command": "action",''' # noqa: F541
            if CONFIG.gary.enable_cot:
                llm = time_gen(llm, f'''
    "reasoning": "{gen("reasoning", stop=['.','\n','"',"<|eot_id|>"], temperature=self.temperature, max_tokens=self.max_tokens(100))}",''')
            llm += f'''
    "chosen_action": "{with_temperature(select(list(actions.keys()), "chosen_action"), self.temperature)}",'''
            chosen_action = llm["chosen_action"]
            # TODO: test without schema reminder
            llm += f'''
    "schema": {dumps(actions[chosen_action].schema_).decode()},'''
            llm = time_gen(llm, f'''
    "data": {json("data", schema=actions[chosen_action].schema_, temperature=self.temperature, max_tokens=self.max_tokens())}
}}
```''')
        data = llm['data']
        if CONFIG.gary.enable_cot:
            reasoning = llm['reasoning']
            logger.info(f"choose_action {reasoning=}")
        logger.info(f"chosen action: {chosen_action}; data: {data}")
        if not ephemeral:
            self.llm = llm
        return (chosen_action, data)

    async def try_action(self, actions: dict[str, ActionModel], allow_yapping: bool = True) -> tuple[str, str] | None:
        if isinstance(self.llm, Randy):
            allow_yapping = False # no thank you
        
        await self.truncate_context(1000 if CONFIG.gary.enable_cot or allow_yapping else 300) # leave room for action() afterwards
        if not actions and not allow_yapping:
            logger.info("No actions to choose from (LLM.try_action)")
            return None
        (ACT, SAY, WAIT) = ("act", "say", "wait")
        ctx = "Based on previous context, decide what to do next."
        if actions:
            # actions_for_json = {name: {"name": name, "description": action.description} for name, action in actions.items()}
            actions_for_json = list(actions.values())
            actions_json = (TypeAdapter(list[ActionModel])
                # .dump_json(actions_for_json, indent=4)
                .dump_json(actions_for_json)
                .decode()
                .replace("\n", "\n    "))
            ctx = f"""
The following actions are available to you:
```json
{{
    "available_actions": {actions_json}
}}
```"""
        options = []
        if actions:
            options.append(ACT)
        if allow_yapping:
            options.append(SAY)
        options.append(WAIT)
        ctx += f"""
Respond with one of these options: {options}
"""
        llm: models.Model = await self.context(ctx, silent=True, ephemeral=True, do_print=False, notify=False)
        with assistant():
            resp = """\
```json
{
    "command": "decision","""
            if CONFIG.gary.enable_cot:
                resp += f"""
    "reasoning": "{gen("reasoning", stop=['\n','"',"<|eot_id|>"], temperature=self.temperature, max_tokens=self.max_tokens(100))}","""
            resp += f"""
    "decision": "{with_temperature(select(options, "decision"), self.temperature)}\""""
            llm = time_gen(llm, resp)
            decision = llm['decision']
            if CONFIG.gary.enable_cot:
                reasoning = llm['reasoning']
                logger.info(f"try_act {reasoning=}")
            logger.info(f"{decision=}")
            if decision == SAY:
                say = f""",
    "message": "{gen("say", stop=['\n','"',"<|eot_id|>"], temperature=self.temperature, max_tokens=self.max_tokens(500))}"
"""
                llm = time_gen(llm, say)
                said = llm['say']
                logger.info(f"try_act {said=}")
            llm += """
}
```"""
        # logger.debug(str(llm))
        if CONFIG.gary.non_ephemeral_try_context:
            self.llm = llm
        if decision == SAY:
            # if not persisted through non_ephemeral_try_context, it's as if the model never spoke
            # so it just repeats itself until the scheduler forces an action
            await self._raise_event('say', said) # type: ignore
        return await self.action(actions) if decision == ACT else None

    async def truncate_context(self, need_tokens: int = 0):
        assert need_tokens >= 0

        token_count = tokens(self.llm)
        used = token_count + need_tokens
        msg = f"Currently at {used}/{self.token_limit} tokens"
        if need_tokens > 0:
            msg += f" (using {token_count}, need {need_tokens} more)"
        logger.debug(msg)
        if used > self.token_limit:
            if isinstance(self.llm, Llarry) and isinstance(self.llm_engine(), StreamingLlamaCppEngine):
                logger.warning(f"Trimming context ({used}/{self.token_limit} tokens used)")
                self.llm = self.llm.trim()
            else:
                logger.warning(f"Truncating context ({used}/{self.token_limit} tokens used)")
                await self.reset()

def tokens(m: models.Model) -> int:
    return len(m.engine.tokenizer.encode(str(m).encode())) # type: ignore

def time_gen[M: models.Model](lm: M, gen_: Function | str) -> M:
    t0 = time.perf_counter()
    prev_tokens_generated: int = lm.metrics.engine_output_tokens
    prev_tokens_in: int = lm.metrics.engine_input_tokens
    out: M = lm + gen_
    generation_took = time.perf_counter() - t0
    tokens_in: int = out.metrics.engine_input_tokens - prev_tokens_in
    tokens_out: int = out.metrics.engine_output_tokens - prev_tokens_generated
    tps: float = tokens_out / generation_took
    logger.debug(f'input {tokens_in} and output {tokens_out} tokens in {generation_took:.2f}s'
        + f' ({tps:.2f} tok/s)' if tps >= 0.5 else f' ({1/tps:.2f} s/tok)'
        + f'; input {tokens_in} tokens'
    )
    return out
