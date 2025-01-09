import math
import random, asyncio, time, textwrap
from guidance import * # type: ignore
from guidance.chat import Llama3ChatTemplate
from guidance._grammar import Function
import llama_cpp

import config
from logger import logger
from spec import *

SchemaLike = Mapping[str, Any] | type[BaseModel] | TypeAdapter

class LLM:
    llm: models.Model
    token_limit: int
    temperature: float
    cot: bool
    rules: str | None

    def __init__(self):
        logger.info("loading model")
        start = time.time()
        # self.llm = models.OpenAI("gpt-4o-mini", api_key=config.MODEL_API_KEY)
        # self.llm = models.Model("https://localhost:12345/", api_key=config.MODEL_API_KEY) # guidance server
        params = {
            "n_ctx": config.MODEL_CTX_LENGTH,
            "n_gpu_layers": -1,
            "seed": random.randint(0, 2**32 - 1),
            "chat_template": Llama3ChatTemplate() if 'Llama-3.1' in config.MODEL_PATH else None,
            "enable_monitoring": False,
        }
        model_cls = models.LlamaCpp if config.MODEL_PATH.endswith('.gguf') else models.Transformers
        self.llm = model_cls(config.MODEL_PATH, **params) # type: ignore
        self.token_limit = math.ceil(config.MODEL_CTX_LENGTH * 0.9)
        # self.token_limit = 1000 # debugging
        self.llm.echo = False
        end = time.time()
        logger.info(f"loaded in {end-start:.2f} seconds")
        self.load_system_prompt()
        self.temperature = config.MODEL_TEMPERATURE
        self.cot = config.ENABLE_COT

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
        logger.debug((tokens(self.llm),1))
        engine = self.llm_engine()
        if isinstance(engine, models.llama_cpp._llama_cpp.LlamaCppEngine):
            engine.reset_metrics()
            logger.debug((tokens(self.llm),2))
            engine.model_obj.reset()
            logger.debug((tokens(self.llm),3))
            llama_cpp.llama_kv_cache_clear(engine.model_obj.ctx)
        logger.debug((tokens(self.llm),4))
        
        # OR - just do this and pray to the GC
        buh = models.Model(self.llm.engine, echo=False)
        self.llm = buh
        assert self.llm.token_count == 0
        assert len(self.llm._current_prompt()) == 0
        # self.llm.engine = models.llama_cpp._llama_cpp.LlamaCppEngine(config.MODEL_PATH, True)
        logger.debug((tokens(self.llm),5))

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
        if custom_rules := config.MANUAL_RULES.get(game, None):
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
            if self.cot:
                llm += f"""\
                I will carefully think about my decision and outline my reasoning. I will keep my thoughts concise. When I'm done, I will reply with the name of the action I want to perform.
                <THOUGHTS>
                {gen("thinking", stop='</THOUGHTS>', temperature=self.temperature, max_tokens=self.max_tokens(500))}
                </THOUGHTS>
                """
                logger.info(f"Thoughts (action): {llm['thinking']}")
            llm += f'I have decided to perform the action "{with_temperature(select(list(actions.keys()), "chosen_action"), self.temperature)}":\n'
            chosen_action = llm["chosen_action"]
            llm += f'''
```json
{{
    command: "action",
    name: "{chosen_action}",'''
            # grr... have to split here because the second generation depends on the first (token limits)
            llm = time_gen(llm, f'''
    reason: "{gen("reason", stop='"', temperature=self.temperature, max_tokens=self.max_tokens(100))}",''')
            llm = time_gen(llm, f'''
    data: {json("data", schema=actions[chosen_action].schema, temperature=self.temperature, max_tokens=self.max_tokens())}
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
        actions_json = (TypeAdapter(dict[str, ActionModel]) 
            # .dump_json(actions, indent=4)
            .dump_json(actions)
            .decode()
            .replace("\n", "\n    "))
        llm: models.Model = self.context(game, f"""
Based on previous context, decide whether you should perform any of the following actions.
```json
{{
    "available_actions": {actions_json}
}}
```""".strip(), silent=True, ephemeral=True, do_print=True)
        with assistant():
            if self.cot:
                llm = time_gen(llm, f"""\
                I will carefully think about my decision and outline my reasoning. I will keep my thoughts concise and focused on the logical steps. When I'm done, I will reply with either 'yes' or 'no'.
                <THOUGHTS>
                {gen("thinking", stop='</THOUGHTS>', temperature=self.temperature, max_tokens=self.max_tokens(500))}
                </THOUGHTS>
                """)
                logger.info(f"Thoughts (try_action): {llm['thinking']}")
            llm += with_temperature(select(['yes', 'no'], 'decision'), self.temperature)
        decision = llm['decision']
        logger.info(decision)
        # logger.debug(llm._current_prompt())
        # self.llm = llm # supposed to be ephemeral
        if decision == 'no':
            return None
        return await self.action(game, actions)
    
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
