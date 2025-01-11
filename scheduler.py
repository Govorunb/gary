import asyncio
from typing import * # type: ignore
from collections.abc import Coroutine

from config import CONFIG, Callable
from logger import logger

if TYPE_CHECKING:
    from registry import Game

class Scheduler:
    def __init__(self, game: "Game"):
        logger.info(f"Created scheduler for {game.name}")
        self.game = game
        self.idle_timeout_try = CONFIG.gary.scheduler.idle_timeout_try
        self.idle_timeout_force = CONFIG.gary.scheduler.idle_timeout_force
        self._active = False
        self._try_task = asyncio.create_task(asyncio.sleep(0))
        self._force_task = asyncio.create_task(asyncio.sleep(0))

    def start(self):
        if self._active:
            return
        self._active = True
        self._reset_idle_timers()

    def stop(self):
        if not self._active:
            return
        self._active = False
        self._try_task.cancel()
        self._force_task.cancel()

    def on_action(self):
        self._reset_idle_timers()

    def on_context(self):
        self._reset_try()

    def _reset_idle_timers(self):
        if not self._active:
            return
        if self.idle_timeout_try > 0:
            self._reset_try()
        else:
            logger.warning("Idle timeout (try) disabled")
        if self.idle_timeout_force > 0:
            self._reset_force()
        else:
            logger.warning("Idle timeout (force) disabled")

    def _reset_try(self):
        self._try_task = self._reset_task(self._try_task, self._wait_try)
    def _reset_force(self):
        self._force_task = self._reset_task(self._force_task, self._wait_force)

    def _reset_task(self, task: asyncio.Task[None], fn: Callable[..., Coroutine[Any, Any, None]]) -> asyncio.Task[None]:
        task.cancel()
        if not self._active:
            return asyncio.create_task(asyncio.sleep(0))
        return asyncio.create_task(fn())

    async def _wait_try(self):
        delay = self.idle_timeout_try
        await asyncio.sleep(delay)
        if not self.game.connection.is_connected():
            self.stop()
            return
        if not self.game.actions:
            logger.info(f"Idled for {delay}s, but no actions")
            self._reset_try()
            return
        logger.warning(f"Idled for {delay}s, trying action")
        if not await self.game.try_action(): # if True, will reset
            self._reset_try()

    async def _wait_force(self):
        delay = self.idle_timeout_force
        await asyncio.sleep(delay)
        if not self.game.connection.is_connected():
            self.stop()
            return
        if not self.game.actions:
            logger.info(f"Didn't do anything for {delay}s! But nothing to force")
            self._reset_idle_timers()
            return
        self._try_task.cancel()
        logger.error(f"Didn't do anything after {delay}s! Forcing")
        if not await self.game._force_any_action():
            self._reset_idle_timers()
