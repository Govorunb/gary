from datetime import datetime
import random, asyncio, time
from guidance import * # type: ignore
from guidance.chat import Llama3ChatTemplate
from guidance._grammar import Function
import llama_cpp

from config import CONFIG, MANUAL_RULES
from logger import logger
from spec import *
if TYPE_CHECKING:
    from registry import Game

# IMPL: this whole file is my implementation since uhh... yeah

SchemaLike = Mapping[str, Any] | type[BaseModel] | TypeAdapter

_engine_map = {
    "openai": models.OpenAI,
    "anthropic": models.Anthropic,
    "azure_openai": models.AzureOpenAI,
    "googleai": models.GoogleAI,
    "llama_cpp": models.LlamaCpp,
    "transformers": models.Transformers,
    "guidance_server": models.Model
}

class LLM:
    llm: models.Model
    token_limit: int
    temperature: float
    rules: str | None

    def __init__(self, game: "Game"):
        self.game = game
        logger.info(f"loading model for {game.name}")
        start = time.time()
        llm_config = CONFIG.llm
        engine = llm_config.engine
        model = llm_config.model

        engine_params = CONFIG.engine_params
        params = {
            "api_key": llm_config.api_key,
            "seed": random.randint(1, 2**32 - 1),
            "chat_template": Llama3ChatTemplate() if 'Llama-3.1' in model else None,
            "enable_monitoring": False,
            **engine_params
        }
        model_cls = _engine_map[engine]
        self.llm = model_cls(model, echo=False, **params) # type: ignore
        self.token_limit = engine_params.get("n_ctx", 1 << 32) - 500
        self.llm.echo = False
        end = time.time()
        logger.info(f"loaded in {end-start:.2f} seconds")
        self.system_prompt()
        self.temperature = engine_params.get("temperature", 1.0)

    def system_prompt(self):
        with system():
            self.llm += """\
You are Larry, an expert gamer AI.
You have a deep knowledge and masterfully honed ability to perform in-game actions via sending JSON to a special software integration system called Gary.
Every action you perform is always meticulously calculated. You always aim to keep your responses varied and entertaining."""

    def llm_engine(self) -> models._model.Engine:
        return self.llm.engine # type: ignore
    
    def max_tokens(self, at_most: int = 100000) -> int:
        maxtok = max(0, min(at_most, self.token_limit - tokens(self.llm)))
        logger.debug(f"Max tokens: {maxtok}")
        return maxtok

    def reset(self):
        # i sure love it when other people handle the low level stuff for me
        # and abstract everything away so that i don't have to deal with any of it
        engine = self.llm_engine()
        if isinstance(engine, models.llama_cpp._llama_cpp.LlamaCppEngine):
            engine.reset_metrics()
            engine.model_obj.reset()
            llama_cpp.llama_kv_cache_clear(engine.model_obj.ctx)
        
        # just pray to the GC i guess
        buh = models.Model(self.llm.engine, echo=False)
        self.llm = buh
        assert self.llm.token_count == 0
        assert len(self.llm._current_prompt()) == 0
        logger.debug(f'truncated context to {tokens(self.llm)}')

        self.system_prompt()

    async def yap(self):
        # TODO: generate monologues (currently prioritizing iteration speed)
        # simulate yap delay
        squared = random.random() ** 2 # bias towards shorter
        delay = 0.5 + 10 * squared
        logger.info(f"yapping for {delay:.2f}")
        await asyncio.sleep(delay)
        logger.info(f"done yapping for {delay:.2f}")

    def gaming(self):
        self.context("Connected.", silent=True)
        if custom_rules := MANUAL_RULES.get(self.game.name, None):
            self.context(custom_rules, silent=True)

    def not_gaming(self):
        self.context("Disconnected.", silent=True)

    def context(self, ctx: str, silent: bool = False, *, ephemeral: bool = False, do_print: bool = True) -> models.Model:
        msg = f"[{datetime.now().strftime('%H:%M:%S')}] [{self.game.name}] {ctx}\n"
        tokens = len(self.llm_engine().tokenizer.encode(msg.encode()))
        self.truncate_context(tokens)
        with user():
            out = self.llm + msg
        if do_print:
            prefix = ""
            if silent:
                prefix += "S"
            if ephemeral:
                prefix += "E"
            if prefix:
                prefix = " " + prefix
            logger.info(f"(ctx{prefix}) {msg}")
            if tokens > 500:
                logger.warning(f"Context '{ctx[:20].encode('unicode_escape').decode()}...' had {tokens} tokens. Are you sure this is a good idea?")
        if not ephemeral:
            self.llm = out
        return out

    async def force_action(self, msg: ForceAction, actions: dict[str, ActionModel]) -> tuple[str, str]:
        assert actions, "No actions to choose from (LLM.force_action)"
        assert self.game.name == msg.game, f"Received ForceAction for game {msg.game} while this LLM is for {self.game.name}"
        ephemeral = msg.data.ephemeral_context or False
        actions_for_json = [actions[name] for name in msg.data.action_names]
        actions_json = (TypeAdapter(list[ActionModel])
            # .dump_json(actions_for_json, indent=4)
            .dump_json(actions_for_json)
            .decode()
            .replace("\n", "\n    "))
        self.context(f"""
You must perform one of the following actions, given this information:
```json
{{
    "query": "{msg.data.query}",
    "state": "{msg.data.state}",
    "available_actions": {actions_json}
}}
```
""",
        silent=True, ephemeral=ephemeral, do_print=False)
        return await self.action(actions, ephemeral=ephemeral)

    async def action(self, actions: dict[str, ActionModel], *, ephemeral: bool = False) -> tuple[str, str]:
        if not actions:
            raise Exception("No actions to choose from (LLM.action)")
        self.truncate_context(500 if CONFIG.gary.enable_cot else 150)
        llm = self.llm
        with assistant():
            llm += f'''\
I have decided to perform the following action:
```json
{{
    "command": "action",'''
            if CONFIG.gary.enable_cot:
                llm = time_gen(llm, f'''
    "reasoning": "{gen("reasoning", stop=['.','\n','"'], temperature=self.temperature, max_tokens=self.max_tokens(100))}",''')
            llm += f'''
    "name": "{with_temperature(select(list(actions.keys()), "chosen_action"), self.temperature)}",'''
            chosen_action = llm["chosen_action"]
            llm += f'''
    "schema": {actions[chosen_action].schema},'''
            llm = time_gen(llm, f'''
    "data": {json("data", schema=actions[chosen_action].schema, temperature=self.temperature, max_tokens=self.max_tokens())}
}}
```
                '''.strip())
        data = llm['data']
        if CONFIG.gary.enable_cot:
            reasoning = llm['reasoning']
            logger.info(f"choose_action {reasoning=}")
        logger.info(f"chosen action: {chosen_action}; data: {data}")
        if not ephemeral:
            self.llm = llm
        return (chosen_action, data)

    async def try_action(self, actions: dict[str, ActionModel]) -> tuple[str, str] | None:
        self.truncate_context(1000 if CONFIG.gary.enable_cot else 300) # leave room for action() afterwards
        if not actions:
            logger.info("No actions to choose from (LLM.try_action)")
            return None
        (YES, NO) = ("act", "wait")
        # actions_for_json = {name: {"name": name, "description": action.description} for name, action in actions.items()}
        actions_for_json = list(actions.values())
        actions_json = (TypeAdapter(list[ActionModel])
            # .dump_json(actions_for_json, indent=4)
            .dump_json(actions_for_json)
            .decode()
            .replace("\n", "\n    "))
        ctx = f"""
Based on previous context, decide whether you should perform any of the following actions.
```json
{{
    "available_actions": {actions_json}
}}
```
Respond with either 'wait' (to do nothing) or 'act' (you will then be asked to choose an action to perform).
"""
        llm: models.Model = self.context(ctx, silent=True, ephemeral=True, do_print=False)
        with assistant():
            resp = f"""
```json
{{
    "command": "decision","""
            if CONFIG.gary.enable_cot:
                resp += f"""
    "reasoning": "{gen("reasoning", stop=['\n','"'], temperature=self.temperature, max_tokens=self.max_tokens(100))}","""
            resp += f"""
    "decision": "{with_temperature(select([YES, NO], "decision"), self.temperature)}"
}}
```"""
            llm = time_gen(llm, resp)
        decision = llm['decision']
        if CONFIG.gary.enable_cot:
            reasoning = llm['reasoning']
            logger.info(f"try_act {reasoning=}")
        logger.info(f"{decision=}")
        # logger.debug(llm._current_prompt())
        if CONFIG.gary.non_ephemeral_try_context:
            self.llm = llm
        return None if decision == NO else await self.action(actions)
    
    def truncate_context(self, need_tokens: int = 0):
        token_count = tokens(self.llm)
        logger.debug(f"Currently using {token_count} tokens out of {self.token_limit}"
                     + f"; also need {need_tokens} - will use {token_count + need_tokens}" if need_tokens > 0 else "")
        if token_count + need_tokens > self.token_limit:
            logger.warning(f"Truncating context ({token_count + need_tokens}/{self.token_limit} tokens used)")
            self.reset()
            if self.game.connection and self.game.connection.is_connected():
                self.gaming()

def tokens(m: models.Model) -> int:
    return len(m.engine.tokenizer.encode(m._current_prompt().encode())) # type: ignore

def time_gen[M: models.Model](lm: M, gen_: Function | str) -> M:
    t0 = time.time()
    prev_tokens_generated: int = lm.token_count
    out: M = lm + gen_
    generation_took = time.time() - t0
    tokens_input: int = out.metrics.engine_input_tokens
    tokens_generated: int = out.token_count - prev_tokens_generated
    tps: float = tokens_generated / generation_took
    logger.debug(f'output {tokens_generated} tokens in {generation_took:.2f}s'
        + f' ({tps:.2f} tok/s)' if tps >= 0.5 else f' ({1/tps:.2f} s/tok)'
        + f'; input {tokens_input} tokens'
    )
    return out
