import math
import random, asyncio, time
from guidance import * # type: ignore
from guidance.chat import Llama3ChatTemplate
from guidance._grammar import Function
import llama_cpp

from config import CONFIG, MANUAL_RULES
from logger import logger
from spec import *

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

    def __init__(self):
        logger.info("loading model")
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
        self.token_limit = math.ceil(engine_params["n_ctx"] * 0.9) if "n_ctx" in engine_params else 1 << 32
        # self.token_limit = 1000 # debugging
        self.llm.echo = False
        end = time.time()
        logger.info(f"loaded in {end-start:.2f} seconds")
        self.load_system_prompt()
        self.temperature = engine_params.get("temperature", 1.0)

    def load_system_prompt(self):
        with system():
            self.llm += """\
You are Larry, an expert gamer AI that livestreams on Twitch.
You have a deep knowledge and masterfully honed ability to perform in-game actions via sending JSON to a special software integration system called Gary.
Every action you perform is always meticulously calculated. You always keep your livestream in mind and do your best to keep your responses varied.
            """.rstrip()

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

        self.load_system_prompt()

    async def yap(self):
        # TODO: generate monologues (currently prioritizing iteration speed)
        # simulate yap delay
        squared = random.random() ** 2 # bias towards shorter
        delay = 0.5 + 10 * squared
        logger.info(f"yapping for {delay:.2f}")
        await asyncio.sleep(delay)
        logger.info(f"done yapping for {delay:.2f}")

    def gaming(self, game: str):
        self.context(game, "Connected.", silent=True)
        if custom_rules := MANUAL_RULES.get(game, None):
            self.context(game, custom_rules, silent=True)
    
    def not_gaming(self, game: str):
        self.context(game, "Disconnected.", silent=True)

    def context(self, game: str, ctx: str, silent: bool = False, *, ephemeral: bool = False, do_print: bool = True) -> models.Model:
        self.truncate_context(game)
        msg = f"[{game}] {ctx}\n"
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
            logger.info(f"(Context{prefix}) {msg}")
        if not ephemeral:
            self.llm = out
        return out

    async def force_action(self, msg: ForceAction, actions: dict[str, ActionModel]) -> tuple[str, str]:
        if not actions:
            raise Exception("No actions to choose from")
        self.context(msg.game, f"""
You must perform one of the following actions, given this information:
```json
{{
    "query": "{msg.data.query}",
    "state": "{msg.data.state}",
    "action_names": {msg.data.action_names},
}}
```
            """.strip(), silent=True, ephemeral=msg.data.ephemeral_context or False)
        return await self.action(msg.game, actions)

    async def action(self, game: str, actions: dict[str, ActionModel], *, ephemeral: bool = False) -> tuple[str, str]:
        if not actions:
            raise Exception("No actions to choose from")
        self.truncate_context(game)
        llm = self.llm
        with assistant():
            if CONFIG.gary.enable_cot:
                llm += f"""\
                I will carefully think about my decision and outline my reasoning. I will keep my thoughts concise. When I'm done, I will reply with the name of the action I want to perform.
                <THOUGHTS>
                {gen("thinking", stop='</THOUGHTS>', temperature=self.temperature, max_tokens=self.max_tokens(500))}
                </THOUGHTS>
                """
                logger.info(f"Thoughts (action): {llm['thinking']}")
            llm += f'I have decided to perform the following action:'
            llm += f'''
```json
{{
    "command": "action",
    "name": "{with_temperature(select(list(actions.keys()), "chosen_action"), self.temperature)}",'''
            chosen_action = llm["chosen_action"]
            # grr... have to split here because the second generation depends on the first (token limits)
            llm = time_gen(llm, f'''
    "reason": "{gen("reason", stop='"', temperature=self.temperature, max_tokens=self.max_tokens(100))}",''')
            llm = time_gen(llm, f'''
    "data": {json("data", schema=actions[chosen_action].schema, temperature=self.temperature, max_tokens=self.max_tokens())}
}}
```
                '''.strip())
        data = llm['data']
        reason = llm['reason']
        logger.info(f"chosen action: {chosen_action}; data: {data} (reason: {reason})")
        if not ephemeral:
            self.llm = llm
        return (chosen_action, data)

    async def try_action(self, game: str, actions: dict[str, ActionModel]) -> tuple[str, str] | None:
        if not actions:
            return None
        logger.warning(f"{actions=} {type(actions)=}")
        (YES, NO) = ("act", "wait")
        # actions_for_json = dict(map(lambda kv: (kv[0], {"name": kv[1].name, "description": kv[1].description}), actions.items()))
        actions_for_json = actions
        actions_json = (TypeAdapter(dict[str, Any])
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
        llm: models.Model = self.context(game, ctx, silent=True, ephemeral=True, do_print=True)
        with assistant():
            resp = f"""
```json
{{
    "command": "decision","""
            if CONFIG.gary.enable_cot:
                resp += f"""
    "reasoning": "{gen("reasoning", stop_regex=r'\n|(?<!\\)"', temperature=self.temperature, max_tokens=self.max_tokens(100))}","""
            resp += f"""
    "decision": "{with_temperature(select([YES, NO], "decision"), self.temperature)}"
}}
```"""
            llm = time_gen(llm, resp)
        decision = llm['decision']
        logger.info(f"{decision=}{f'; {llm['reasoning']}' if CONFIG.gary.enable_cot else ''}")
        # logger.debug(llm._current_prompt())
        if CONFIG.gary.non_ephemeral_try_context:
            self.llm = llm
        return None if decision == NO else await self.action(game, actions)
    
    def truncate_context(self, game: str | None):
        token_count = tokens(self.llm)
        logger.debug(f"Currently using {token_count} tokens out of {self.token_limit}")
        if token_count > self.token_limit:
            logger.warning(f"Truncating context")
            self.reset()
            if game is not None:
                self.gaming(game)

def tokens(m: models.Model) -> int:
    return len(m.engine.tokenizer.encode(m._current_prompt().encode())) # type: ignore

def time_gen[M: models.Model](lm: M, gen_: Function | str) -> M:
    t0 = time.time()
    prev_tokens_generated: int = lm.engine.metrics.engine_output_tokens # type: ignore
    out: M = lm + gen_
    generation_took = time.time() - t0
    engine: models._model.Engine = out.engine # type: ignore
    tokens_input: int = engine.metrics.engine_input_tokens
    tokens_generated: int = engine.metrics.engine_output_tokens - prev_tokens_generated
    engine.reset_metrics()
    tps: float = tokens_generated / generation_took
    logger.info(f'input {tokens_input} and output {tokens_generated} tokens in {generation_took:.2f}s'
          + f' ({tps:.2f} tok/s)' if tps >= 0.5 else f' ({1/tps:.2f} s/tok)')
    return out
