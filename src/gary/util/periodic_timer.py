import asyncio
import logging
from typing import Any, Callable, Coroutine

_COMPLETED_TASK = asyncio.Task(asyncio.sleep(0))
_DEBUG = False
_logger = logging.getLogger(__name__)

class PeriodicTimer:
    def __init__(self, interval: float, callback: Callable[..., Coroutine[Any, Any, bool]], name: str = "timer", start_immediately: bool = False):
        assert interval >= 0, "Interval must be at least 0"
        self._interval = interval
        self.callback = callback
        self.name = name
        self._task: asyncio.Task[None] = _COMPLETED_TASK
        self._active = False
        self.debug = _DEBUG
        if start_immediately:
            self.start()

    def start(self) -> None:
        if self._active:
            return
        self._debug(f"Starting {self.name}")
        self._active = True
        self.reset()

    def stop(self) -> None:
        if not self._active:
            return
        self._debug(f"Stopping {self.name}")
        self._active = False
        self._task.cancel()

    def reset(self) -> None:
        self._debug(f"Resetting {self.name}")
        self._task.cancel()
        if not self._active:
            return
        self._task = asyncio.create_task(self._run()) if self._interval > 0 else _COMPLETED_TASK

    @property
    def active(self) -> bool:
        return self._active

    @property
    def interval(self) -> float:
        return self._interval

    @interval.setter
    def interval(self, new_interval: float) -> None:
        self._interval = new_interval
        self.reset()

    async def _run(self):
        self._debug(f"{self.name} sleeping for {self._interval}")
        await asyncio.sleep(self._interval)
        self._debug(f"{self.name} woke up: {'active' if self._active else 'not active'}")
        if not self._active:
            return
        restart = await self.callback()
        self._debug(f"{self.name} executed callback: {'continue' if restart else 'done'}")
        if restart:
            self.reset()
    
    def _debug(self, msg: str) -> None:
        if not self.debug:
            return
        _logger.debug(msg)
