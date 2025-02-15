from typing import TYPE_CHECKING

from ..util import CONFIG, logger, PeriodicTimer
from ..llm.events import ForceAction, TryAction
if TYPE_CHECKING:
    from ..registry import Game

class IdleScheduler:
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
        self.game.scheduler.enqueue(TryAction())
        return True

    async def _force(self):
        if not self.game.connection.is_connected():
            self.stop()
            return False
        if not self.game.actions:
            logger.info(f"Didn't do anything for {self._force_timer.interval}s! But nothing to force")
            return True
        logger.error(f"Didn't do anything after {self._force_timer.interval}s! Forcing")
        self.game.scheduler.enqueue(ForceAction())
        return True
