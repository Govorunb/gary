from typing import Self
from guidance.models.llama_cpp._llama_cpp import LlamaCpp, LlamaCppEngine
from guidance.models._model import Model
from gary.util import logger

class StreamingLlamaCppEngine(LlamaCppEngine):
    def __init__(self, llama_cpp_engine: LlamaCppEngine):
        self.llama_cpp_engine = llama_cpp_engine
        # gee, llarry, how come your mom lets you have both composition *and* inheritance
        self.model = llama_cpp_engine.model
        self.model_obj = llama_cpp_engine.model_obj
        self._context = llama_cpp_engine._context
        self._cache_token_ids = llama_cpp_engine._cache_token_ids
        self._n_vocab = llama_cpp_engine._n_vocab

        self.tokenizer = llama_cpp_engine.tokenizer
        self.compute_log_probs = llama_cpp_engine.compute_log_probs
        self._enable_backtrack = llama_cpp_engine._enable_backtrack
        self._enable_ff_tokens = llama_cpp_engine._enable_ff_tokens
        self._enable_monitoring = llama_cpp_engine._enable_monitoring
        self._top_k = llama_cpp_engine._top_k
        self.metrics = llama_cpp_engine.metrics

        self.trace_handler = llama_cpp_engine.trace_handler
        self.renderer = llama_cpp_engine.renderer
        # we don't handle the renderer subscription since this is only ever used in a terminal

        self.model_dict = llama_cpp_engine.model_dict

        self.monitor = llama_cpp_engine.monitor
        self.periodic_metrics_generator = llama_cpp_engine.periodic_metrics_generator
        self.post_exec_metrics = llama_cpp_engine.post_exec_metrics

        self.default_n_keep = 500
        self.default_n_discard = None # n_ctx // 2
    
    def shift_kv_cache(self, n_keep, n_discard, seq_id=0):
        self.model_obj._ctx.kv_cache_seq_rm(seq_id, n_keep, n_keep + n_discard)
        self.model_obj._ctx.kv_cache_seq_shift(seq_id, n_keep, -1, -n_discard)

    def trim(self, token_ids: list[int], n_keep: int | None = None, n_discard: int | None = None) -> list[int]:
        n_keep = n_keep or self.default_n_keep

        n_discard = n_discard or self.default_n_discard or (self.model_obj.n_ctx() // 2)
        n_discard = min(len(token_ids) - n_keep, n_discard)

        self.shift_kv_cache(n_keep, n_discard)
        
        token_ids = token_ids[:n_keep] + token_ids[n_keep + n_discard:]
        logger.warning(f"now {len(token_ids)} - let's hope this works")
        # logger.critical(self.tokenizer.decode(token_ids).decode())
        self._cache_token_ids.clear()
        return token_ids

_warned = False

class Llarry(LlamaCpp):
# class Llarry(LlamaCpp, Chat):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if isinstance(self.engine, LlamaCppEngine) and not isinstance(self.engine, StreamingLlamaCppEngine): # can be RemoteEngine instead
            self.engine = StreamingLlamaCppEngine(self.engine)
        self.persistent: list[int] = []

    def trim(self) -> Self:
        if not isinstance(self.engine, StreamingLlamaCppEngine):
            global _warned
            if not _warned:
                _warned = True
                logger.info("cannot trim remote engine")
            return self

        logger.warning("pray now my lord")
        prompt = self._current_prompt()
        tokens = self.engine.tokenizer.encode(prompt.encode())
        # TODO: see if we can maybe keep state as we add the messages
        # (probably not because of assistant msgs interleaving append/generate)
        messages = prompt.split("<|start_header_id|>")
        total_tokens = 0
        n_keep = 0
        max_discard = self.engine.model_obj.n_ctx() // 2
        n_discard = 0
        i_start_discard = 0
        i_end_discard = 0
        for i, message in enumerate(messages):
            if n_discard >= max_discard:
                break
            
            if message == "<|begin_of_text|>":
                total_tokens += 1
                continue
            
            msg_toks = self.engine.tokenizer.encode(message.encode())
            num_tokens = len(msg_toks) + 1 # count the token we split on
            
            can_discard: bool = True
            try:
                role = message[:message.index("<|end_header_id|>")]
                can_discard = not (role == "system" or i in self.persistent)
                # logger.debug(f"{role=};{message=}")
            except ValueError:
                logger.warning(f"""\
Message {i} is malformed - has no end_header_id
Message: <|start_header_id|>{message}
Assuming discardable!""")
            
            # 1. go until first discardable; this is n_keep
            # 2. then, find non-discardable message
            # 3. all tokens between are discardable
            if n_keep == 0:
                if can_discard:
                    n_keep = total_tokens
                    i_start_discard = i
            else:
                if can_discard:
                    n_discard = total_tokens - n_keep
                else:
                    i_end_discard = i
                    break
            total_tokens += num_tokens
        persist_shift = i_end_discard - i_start_discard + 1
        
        # logger.warning(f"Trim:\n{n_keep=}\n{n_discard=}\nKept:\n{self.engine.tokenizer.decode(tokens[:n_keep]).decode()}")

        tokens = self.engine.trim(tokens, n_keep, n_discard)
        # this code is ok because i'm not a python dev :)
        copy = self.__new__(self.__class__)
        # initializers above Model create an Engine, we don't want that
        # literally just want to reset state
        Model.__init__(copy, self.engine, echo = False)
        copy.persistent = [i - persist_shift for i in self.persistent if i >= i_start_discard] # immutability
        new_prompt = self.engine.tokenizer.decode(tokens).decode()
        # logger.critical(f"New prompt:\n{new_prompt}")
        copy += new_prompt
        return copy
