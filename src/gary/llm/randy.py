from guidance.models._mock import Mock, MockEngine
import numpy as np
from loguru import logger

class Randy(Mock):
    def __init__(self, *args, echo: bool = False, **kwargs):
        super().__init__(*args, **kwargs)
        self.engine = RandyEngine(self.engine.tokenizer, self.engine.byte_patterns, self.engine.compute_log_probs, self.engine.force, **kwargs)

class RandyEngine(MockEngine):
    def __init__(self, *args, seed: int = 42, **kwargs):
        logger.info(f"Randy's seed: {seed}")
        super().__init__(*args)
        self._rand_generator = np.random.default_rng(seed)
