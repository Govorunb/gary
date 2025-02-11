from collections import namedtuple
import functools
import re
import time
from typing import Self, Sequence, cast
from guidance.chat import ChatTemplate
from guidance.models.llama_cpp._llama_cpp import LlamaCpp, LlamaCppEngine, LlamaCppTokenizer
from guidance.models._model import Model
from llama_cpp import Llama
from gary.util import logger

class StreamingLlamaCppEngine(LlamaCppEngine):
    def __init__(self, llama_cpp_engine: LlamaCppEngine, **kwargs):
        self.llama_cpp_engine = llama_cpp_engine
        # gee, llarry, how come your mom lets you have both composition *and* inheritance
        self.model = llama_cpp_engine.model
        self.model_obj = llama_cpp_engine.model_obj
        self._context = llama_cpp_engine._context
        self._cache_token_ids = llama_cpp_engine._cache_token_ids
        self._n_vocab = llama_cpp_engine._n_vocab

        parent_tokenizer: LlamaCppTokenizer = cast(LlamaCppTokenizer, llama_cpp_engine.tokenizer)
        self.tokenizer = LlarryTokenizer(parent_tokenizer._model_obj, parent_tokenizer._chat_template) # type: ignore
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

        self.default_n_keep = kwargs.get("n_keep", 500)
        self.default_n_discard = kwargs.get("n_discard") # n_ctx // 2

    def shift_kv_cache(self, n_keep, n_discard, seq_id=0):
        self.model_obj._ctx.kv_cache_seq_rm(seq_id, n_keep, n_keep + n_discard)
        self.model_obj._ctx.kv_cache_seq_shift(seq_id, n_keep, -1, -n_discard)

    def trim(self, token_ids: list[int], n_keep: int | None = None, n_discard: int | None = None) -> list[int]:
        n_keep = n_keep or self.default_n_keep

        n_discard = n_discard or self.default_n_discard or (self.model_obj.n_ctx() // 2)
        n_discard = min(len(token_ids) - n_keep, n_discard)

        t = time.perf_counter()
        self.shift_kv_cache(n_keep, n_discard)
        logger.debug(f"Shifted KV cache by {n_discard} (from {n_keep}) in {(time.perf_counter()-t)*1000:.2f}ms")

        token_ids = token_ids[:n_keep] + token_ids[n_keep + n_discard:]
        logger.info(f"Trimmed context to {len(token_ids)} tokens")
        # logger.critical(self.tokenizer.decode(token_ids).decode())
        self._cache_token_ids.clear()
        return token_ids

_warned = False

class Llarry(LlamaCpp):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # can be RemoteEngine instead
        if isinstance(self.engine, LlamaCppEngine) and not isinstance(self.engine, StreamingLlamaCppEngine):
            self.engine = StreamingLlamaCppEngine(self.engine, **kwargs)
        self.persistent: set[int] = set()

    @functools.cache
    def get_msg_end_tokens(self):
        ends: set[str] = set()
        chat_template = self.engine.get_chat_template()
        for role in ["system", "user", "assistant"]:
            try:
                ends.add(chat_template.get_role_end(role))
            except Exception as e:
                logger.debug(f"No role end for '{role}' {e}")
        return list(ends)

    Message = namedtuple("Message", "all_tokens start size")

    def iter_messages_tokens(self):
        tokenizer = self.engine.tokenizer
        msg_ends = [tokenizer.encode(end.encode()) for end in self.get_msg_end_tokens()]
        # logger.debug(f"{msg_ends=} / {self.get_msg_end_tokens()=}")
        prompt = str(self)
        tokens = tokenizer.encode(prompt.encode())
        # logger.debug(f"{tokens[:50]=}")
        start = size = 0
        for i_tok in range(len(tokens)):
            size += 1
            # technically if ends share tokens they can overlap, yielding trash
            # but realistically who would ever make their chat template this way
            if any(tokens[i_tok+1-len(end) : i_tok+1] == end for end in msg_ends):
                yield Llarry.Message(tokens, start, size)
                start += size
                size = 0
        if size > 0:
            logger.warning("Last message was not terminated by a message end token.\n"
                "Don't forget to add an empty string after exiting the role context manager so guidance can add the role closer.")
            last_msg = tokenizer.decode(tokens[start:start+size])
            logger.debug(f"Last message:\n{last_msg}")
            # logger.debug(f"Prompt:\n{prompt}")
            yield Llarry.Message(tokens, start, size)

    def iter_messages_text(self):
        msg_ends = self.get_msg_end_tokens()
        prompt = str(self)
        out = re.split('|'.join(re.escape(e) for e in msg_ends), prompt)
        return out[:-1] if out[-1] == '' else out

    def trim(self) -> Self:
        if not isinstance(self.engine, StreamingLlamaCppEngine):
            global _warned
            if not _warned:
                _warned = True
                logger.warning(f"only {StreamingLlamaCppEngine.__name__} can be trimmed; current engine is {type(self.engine).__name__}")
            return self

        # logger.warning("pray now my lord")
        t0 = time.perf_counter()
        # TODO: see if we can maybe keep state as we add the messages
        # (probably not because of assistant msgs interleaving append/generate)
        sys_begin = None
        len_sys_begin = 0
        chat_template = self.engine.get_chat_template()

        tokenizer = self.engine.tokenizer
        try:
            sys_begin_text = chat_template.get_role_start("system")
            sys_begin = tokenizer.encode(sys_begin_text.encode())
            len_sys_begin = len(sys_begin)
        except Exception:
            logger.warning("Could not get system role start")
        # having easily accessible utility methods to do common things like split a list is clearly not pythonic
        n_keep = -1
        n_discard = 0
        # TODO: rework "max discard" to keep the most recent context instead
        max_discard = self.engine.model_obj.n_ctx() // 2
        i_start_discard = i_end_discard = 0
        def can_discard(i_message: int, msg: Llarry.Message) -> bool:
            if i_message in self.persistent:
                # logger.warning(f"message {i_message} is persistent ({self.persistent})")
                return False
            if n_discard >= max_discard:
                # logger.warning("discard over max")
                return False

            if not sys_begin:
                return True
            msg_begin = msg.all_tokens[msg.start : msg.start+len_sys_begin]
            # logger.debug(f"i={i_message} begin={msg_begin} is_system={msg_begin == sys_begin}")
            return msg_begin != sys_begin

        def on_message_end(i: int, msg: Llarry.Message) -> bool:
            '''
            Returns:
                Whether to continue iterating to the next message.
            '''
            nonlocal n_discard, n_keep
            nonlocal i_start_discard, i_end_discard

            # 1. first discardable is n_keep
            # 2. then, find first non-discardable message
            # 3. all tokens between are discardable
            discardable = can_discard(i, msg)
            if n_keep == -1:
                if discardable:
                    # logger.warning(f"first discardable at {msg.start} (#{i})")
                    n_keep = msg.start
                    i_start_discard = i
                return True
            if discardable:
                n_discard = msg.start - n_keep
            else:
                # logger.warning(f"discardable span ends at {msg.start} (#{i})")
                i_end_discard = i
            return discardable

        has_any = False
        i_msg = 0 # just so it's not unbounded if there's no messages
        for i_msg, msg in enumerate(self.iter_messages_tokens()):
            has_any = True
            # (toks, start, size) = msg
            # message_tokens = toks[start:start+size]
            # message = tokenizer.decode(message_tokens).decode()
            # logger.info(f"message #{i}: {message}")
            if not on_message_end(i_msg, msg):
                break
        else:
            i_end_discard = i_msg
        if not has_any:
            logger.debug("Nothing to trim, aborting")
            return self

        persist_shift = i_end_discard - i_start_discard + 1

        if n_keep == -1:
            n_keep = 0
            logger.fatal(
                "Didn't find a single discardable message!"
                f"\nPrompt: {str(self)}"
                f"\nMessages: {[tokenizer.decode(msg.all_tokens[msg.start, msg.start+msg.size]).decode() for msg in self.iter_messages_tokens()]}"
            )
            logger.warning("Attempting to continue, but you may not like the result")

        tokens = self.engine.trim(msg.all_tokens, n_keep, n_discard) # type: ignore (zero depth flow control analysis)
        # this code is ok because i'm not a python dev :)
        copy = self.__new__(self.__class__)
        # initializers above Model create an Engine, we don't want that
        # literally just want to reset state
        Model.__init__(copy, self.engine, echo = False)
        copy.persistent = set(p - persist_shift if p >= i_end_discard else p for p in self.persistent) # immutability

        new_prompt = tokenizer.decode(tokens).decode()
        logger.debug("Trimmed in {:.4f}ms".format((time.perf_counter()-t0)*1000))
        # logger.debug(f"{n_keep=} {n_discard=} {i_start_discard=} {i_end_discard=} {persist_shift=}")
        # logger.debug(f"Previous prompt:\n{str(self)}")
        # logger.debug(f"New tokens:\n{tokens[:50]}")
        # logger.debug(f"New prompt:\n{new_prompt[:50]}")
        return copy + new_prompt

class LlarryTokenizer(LlamaCppTokenizer):
    def __init__(self, model_obj: Llama, chat_template: ChatTemplate | str | None):
        super().__init__(model_obj, chat_template)
        self._is_phi = "phi" in model_obj.model_path.lower()\
            or "phi" in model_obj.metadata.get("general.architecture", "").lower()

    def decode(self, tokens: Sequence[int]) -> bytes:
        out = super().decode(tokens)
        # failsafe for workaround in encode()
        if self._is_phi:
            out = out.replace(b"|> \n", b"|>\n")
        return out

    def encode(self, byte_string: bytes) -> list[int]:
        tokens = super().encode(byte_string)
        out = tokens
        # workaround https://github.com/ggerganov/llama.cpp/issues/7938
        # TLDR: Phi3's tokenizer inserts spaces after special tokens
        # e.g. Phi3 system start message is "<|system|>\n"
        #   which should be [32006] since the token has the 'rstrip' flag - or, at *worst*, [32006, 13]
        # but it tokenizes to [32006, 29871, 13] which is "<|system|> \n"
        # on re-encode it inserts another space ([32006, 259, 13] - "<|system|>  \n")
        # which obviously breaks round tripping and kv-caching and everything else
        if self._is_phi:
            out = []
            for i, t in enumerate(tokens):
                # replaces [..., <|special_token|>, 29871, 13, ...] with [..., <|special token|>, 13, ...]
                if i >= 2 and t == 13 and out[-1] == 29871 and out[-2] in range(32000, 32011):
                    out[-1] = 13
                    continue
                out.append(t)
        return out
