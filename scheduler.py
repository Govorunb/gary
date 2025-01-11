import asyncio
from typing import * # type: ignore
from collections.abc import Coroutine

from config import CONFIG, Callable
from logger import logger

if TYPE_CHECKING:
    from registry import Game

class Scheduler:
    def __init__(self, game: "Game"):
        self.game = game
        self.try_idle_timeout = CONFIG.gary.scheduler.idle_timeout_try
        self.force_idle_timeout = CONFIG.gary.scheduler.idle_timeout_force
        self._try_task = None
        self._force_task = None

    def start(self):
        self._reset_idle_timers()

    def stop(self):
        _ = self._try_task and self._try_task.cancel()
        _ = self._force_task and self._force_task.cancel()
        self._try_task = None
        self._force_task = None

    def on_action(self):
        self._reset_idle_timers()

    def _reset_idle_timers(self):
        self._try_task = self._reset_task(self._try_task, self._wait_try)
        self._force_task = self._reset_task(self._force_task, self._wait_force)
    
    def _reset_task(self, task: asyncio.Task[None] | None, fn: Callable[..., Coroutine[Any, Any, None]]) -> asyncio.Task[None]:
        _ = task and task.cancel()
        return asyncio.create_task(fn())
    
    async def _wait_try(self):
        delay = self.try_idle_timeout
        if delay <= 0:
            return
        await asyncio.sleep(delay)
        logger.warning(f"Idled for {delay}, trying action")
        if not await self.game.try_action():
            self._reset_task(self._try_task, self._wait_try)
    
    async def _wait_force(self):
        if self._try_task and not self._try_task.done():
            self._try_task.cancel()
        delay = self.force_idle_timeout
        if delay <= 0:
            return
        await asyncio.sleep(delay)
        logger.error(f"Didn't do anything after {delay}! Forcing")
        if not await self.game._force_any_action():
            self._reset_idle_timers()
