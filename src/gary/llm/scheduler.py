import asyncio
from typing import TYPE_CHECKING, Any, Callable, Coroutine

from ..util import CONFIG, logger
if TYPE_CHECKING:
    from ..registry import Game

_COMPLETED_TASK = asyncio.Task(asyncio.sleep(0))
_DEBUG = False
_logger = logger.getChild(__name__)

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

class Scheduler:
    def __init__(self, game: "Game"):
        logger.info(f"Created scheduler for {game.name}")
        self.game = game
        idle_timeout_try = CONFIG.gary.scheduler.idle_timeout_try
        idle_timeout_force = CONFIG.gary.scheduler.idle_timeout_force

        if not idle_timeout_try:
            logger.info("Idle timeout (try) disabled")
        if not idle_timeout_force:
            logger.info("Idle timeout (force) disabled")

        self._active = False
        self._try_timer = PeriodicTimer(
            idle_timeout_try,
            self._try,
            name="try_timer",
        )
        self._force_timer = PeriodicTimer(
            idle_timeout_force,
            self._force,
            name="force_timer",
        )

    def start(self):
        if self._active:
            return
        self._active = True
        self._try_timer.start()
        self._force_timer.start()

    def stop(self):
        if not self._active:
            return
        self._active = False
        self._try_timer.stop()
        self._force_timer.stop()

    def on_action(self, *_):
        if not self._active:
            return
        self._try_timer.reset()
        self._force_timer.reset()

    def on_context(self, *_):
        if not self._active:
            return
        self._try_timer.reset()

    async def _try(self):
        if not self.game.connection.is_connected():
            self.stop()
            return False
        if not self.game.actions and not CONFIG.gary.allow_yapping:
            logger.info(f"Idled for {self._try_timer.interval}s, but no actions")
            return True
        logger.warning(f"Idled for {self._try_timer.interval}s, trying action")
        return not await self.game.try_action() # if acted, on_action will reset

    async def _force(self):
        if not self.game.connection.is_connected():
            self.stop()
            return False
        if not self.game.actions:
            logger.info(f"Didn't do anything for {self._force_timer.interval}s! But nothing to force")
            return True
        # FIXME: timer awkwardness where they can overlap/both try to execute at the same time (while LLM is blocking)
        # queue scheduler will come eventually
        logger.error(f"Didn't do anything after {self._force_timer.interval}s! Forcing")
        retry = not await self.game._force_any_action()
        if retry:
            self._try_timer.reset()
        return retry
