from typing import cast
from guidance.models._mock import Mock, MockEngine
from guidance.models._engine import EngineClient
import numpy as np
from loguru import logger

class Randy(Mock):
    def __init__(self, *args, echo: bool = False, seed: int = 42, **kwargs):
        super().__init__(*args, **kwargs)
        self._client: EngineClient
        engine = cast(MockEngine, self._client.engine)
        logger.info(f"Randy's seed: {seed}")
        engine._rand_generator = np.random.default_rng(seed)
