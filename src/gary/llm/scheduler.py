from queue import Empty, PriorityQueue
import asyncio
import threading
import time
import traceback

from typing import TYPE_CHECKING
from loguru import logger

from ..util import CONFIG, PeriodicTimer
from .events import BaseEvent, ClearContext, Context, Mute, TryAction, ForceAction, Say, Sleep, Unmute

if TYPE_CHECKING:
    from ..registry import Game

class Scheduler:
    def __init__(self, game: "Game"):
        self._queue: PriorityQueue[BaseEvent] = PriorityQueue()
        self._game = game
        self._running = False
        self._busy = False
        self._mutes: dict[str, bool] = {}
        self._event_loop: asyncio.AbstractEventLoop | None = None
        self._worker_thread: threading.Thread | None = None
        self._has_pending_try_action = False
        game.subscribe('action', self._on_action)
        game.llm.subscribe('context', self._on_context)
        game.llm.subscribe('say', self._on_say)

        # Initialize idle timers
        idle_timeout_try = CONFIG.gary.scheduler.idle_timeout_try
        idle_timeout_force = CONFIG.gary.scheduler.idle_timeout_force

        if not idle_timeout_try:
            logger.debug("Idle timeout (try) disabled")
        if not idle_timeout_force:
            logger.debug("Idle timeout (force) disabled")

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

    @property
    def game(self) -> "Game":
        return self._game

    @property
    def busy(self):
        return self._busy

    @property
    def muted_web(self):
        return self._mutes.get('web', False)
    @property
    def muted_game(self):
        return self._mutes.get('game', False)
    @property
    def sleeping(self):
        return self._mutes.get('sleeping', False)

    @muted_web.setter
    def muted_web(self, muted: bool):
        self._set_mute('web', muted)
    @muted_game.setter
    def muted_game(self, muted: bool):
        self._set_mute('game', muted)
    @sleeping.setter
    def sleeping(self, sleeping: bool):
        self._set_mute('sleeping', sleeping)
    
    def _set_mute(self, mute: str, muted: bool):
        if self._mutes.get(mute) == muted:
            return
        self._mutes[mute] = muted
        self._update_mute()

    @property
    def can_act(self):
        return not any(self._mutes.values())

    def _update_mute(self):
        if not self.can_act or not self.game.connection.is_connected():
            self._stop_timers()
        else:
            self._start_timers()
            self.enqueue(TryAction())

    def _stop_timers(self):
        self._try_timer.stop()
        self._force_timer.stop()

    def _start_timers(self):
        self._try_timer.start()
        self._force_timer.start()
    
    @property
    def status(self):
        mutes = [k for k, v in self._mutes.items() if v]
        return ' '.join(mutes) or 'active'

    def start(self) -> None:
        """Start the event processing loop in a separate thread."""
        if self._running:
            return
        self._running = True
        self._worker_thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._worker_thread.start()
        if self.can_act:
            self._start_timers()

    def stop(self) -> None:
        """Stop the event processing loop."""
        if not self._running:
            return
        self._running = False
        self._stop_timers()
        if self._event_loop:
            self._event_loop.call_soon_threadsafe(self._event_loop.stop)
        if self._worker_thread:
            self._worker_thread.join()
        self._event_loop = None
        self._worker_thread = None

    def enqueue(self, event: BaseEvent) -> bool:
        """Add an event to the queue.

        Events are processed in priority order (lower priority value = higher priority).
        Within the same priority level, events are processed in FIFO order.
        """
        if not self.game.connection.is_connected():
            return False

        if isinstance(event, TryAction):
            if self._has_pending_try_action:
                logger.debug("Skipping duplicate TryAction - one already pending")
                return False
            self._has_pending_try_action = True
        
        self._queue.put_nowait(event)
        return True

    def _pop(self) -> BaseEvent | None:
        """Get the next event from the queue."""
        try:
            return self._queue.get_nowait()
        except Empty:
            return None

    def is_empty(self) -> bool:
        """Check if the event queue is empty."""
        return self._queue.empty()

    def _run_event_loop(self) -> None:
        """Run the event loop in a separate thread."""
        self._event_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._event_loop)

        try:
            self._event_loop.run_until_complete(self._process_events())
        except RuntimeError as e:
            # Ignore "Event loop stopped before Future completed" error
            # This happens during normal shutdown when the loop is stopped while processing events
            if str(e) != 'Event loop stopped before Future completed.':
                logger.error(f"Error in event loop: {e}\nTraceback:\n{traceback.format_exc()}")
        finally:
            self._event_loop.close()
            self._event_loop = None

    async def _process_events(self) -> None:
        """Process events from the queue."""
        while self._running:
            if self._busy:
                # If we're busy processing an event, wait a bit
                await asyncio.sleep(0.1)
                continue

            event = self._pop()
            if not event:
                # If no events, wait a bit before checking again
                await asyncio.sleep(0.1)
                continue

            try:
                self._busy = True
                logger.trace(f"Processing {type(event).__name__} event with priority {event.priority.name}")
                if isinstance(event, TryAction):
                    self._has_pending_try_action = False
                await self._handle_event(event)
            except Exception as e:
                logger.error(f"Error processing event: {e}\nTraceback:\n{traceback.format_exc()}")
            finally:
                self._busy = False
                self._queue.task_done()

    @logger.catch()
    async def _handle_event(self, event: BaseEvent) -> None:
        """Handle a single event based on its type."""
        match event:
            case Context():
                await self.game.llm.context(
                    event.ctx,
                    event.sender or self.game.name,
                    silent=event.silent,
                    ephemeral=event.ephemeral,
                    persistent_llarry_only=event.persistent_llamacpp_only,
                    notify=event.notify
                )
                if not event.silent:
                    self.enqueue(TryAction())
            case TryAction():
                actions = event.actions or list(self.game.actions.values())
                allow_yapping = event.allow_yapping if event.allow_yapping is not None else CONFIG.gary.allow_yapping
                if not actions and not allow_yapping:
                    logger.error("TryAction with nothing to do")
                    return
                if not self.can_act:
                    logger.debug(f"TryAction event ignored - {self.status}")
                    return
                act = await self.game.llm.try_action(actions, allow_yapping=allow_yapping)
                await self.game.execute_action(act)
            case ForceAction():
                if not self.can_act:
                    logger.debug(f"ForceAction event ignored - {self.status}")
                    return
                if event.force_message:
                    act = await self.game.llm.force_action(event.force_message)
                else:
                    actions = list(self.game.actions.values())
                    act = await self.game.llm.action(actions)
                await self.game.execute_action(act)
            case Say():
                if not event.message and not self.can_act:
                    logger.warning(f"Tried to generate Say but {self.status} - Say event from {event.timestamp}")
                    return
                await self.game.llm.say(message=event.message, ephemeral=event.ephemeral)
            case Sleep():
                async def sleep(duration: float):
                    self.sleeping = True
                    await asyncio.sleep(duration)
                    self.sleeping = False
                    logger.trace(f"Woke up from Sleep sent at {event.timestamp.time()}")
                sleep_until = event.timestamp.timestamp() + event.duration
                sleep_for = sleep_until - time.time()
                logger.trace(f"Sleeping for {sleep_for:.2f}s (Sleep for {event.duration:.2f} sent at {event.timestamp.time()})")
                asyncio.create_task(sleep(sleep_for))
            case ClearContext():
                logger.trace("Clearing context")
                await self.game.llm.reset(True)
            case Mute():
                logger.info("Muted by game")
                self.muted_game = True
            case Unmute():
                logger.info("Unmuted by game")
                self.muted_game = False
            case _:
                logger.warning(f"Unknown event type: {type(event)}")

    async def _try(self) -> bool:
        if not self.game.actions and not CONFIG.gary.allow_yapping:
            logger.debug(f"Idled for {self._try_timer.interval}s, but no actions")
            return True
        logger.info(f"Idled for {self._try_timer.interval}s, trying action")
        return self.enqueue(TryAction())

    async def _force(self) -> bool:
        if not self.game.actions:
            logger.info(f"Didn't do anything for {self._force_timer.interval}s! But nothing to force")
            return True
        logger.warning(f"Didn't do anything after {self._force_timer.interval}s! Forcing")
        return self.enqueue(ForceAction())

    def _on_context(self, *_):
        self._try_timer.reset()

    def _on_action(self, *_):
        self._force_timer.reset()
        self._try_timer.reset()

    def _on_say(self, said: str):
        if not CONFIG.gary.scheduler.sleep_after_say:
            return
        # very sophisticated
        duration = len(said) * 0.1
        self.enqueue(Sleep(duration))
