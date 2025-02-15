from queue import Empty, PriorityQueue
import asyncio
import logging
import threading
import time
import traceback
from typing import TYPE_CHECKING

from ..util import CONFIG, PeriodicTimer
from .events import BaseEvent, Context, TryAction, ForceAction, Say, Sleep

if TYPE_CHECKING:
    from ..registry import Game

class Scheduler:
    def __init__(self, game: "Game"):
        self._queue: PriorityQueue[BaseEvent] = PriorityQueue()
        self._game = game
        self._active = False
        self._busy = False
        self._muted = False
        self._sleeping = False
        self._event_loop: asyncio.AbstractEventLoop | None = None
        self._worker_thread: threading.Thread | None = None
        self._logger = logging.getLogger(__name__)
        game.subscribe('action', self._on_action)
        game.llm.subscribe('context', self._on_context)
        self.game.llm.subscribe('say', self._on_say)

        # Initialize idle timers
        idle_timeout_try = CONFIG.gary.scheduler.idle_timeout_try
        idle_timeout_force = CONFIG.gary.scheduler.idle_timeout_force

        if not idle_timeout_try:
            self._logger.info("Idle timeout (try) disabled")
        if not idle_timeout_force:
            self._logger.info("Idle timeout (force) disabled")

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
    def muted(self):
        return self._muted

    @property
    def sleeping(self):
        return self._sleeping

    @property
    def can_act(self):
        return not self._muted and not self._sleeping

    @muted.setter
    def muted(self, muted: bool):
        if self._muted == muted:
            return
        self._muted = muted
        self._update_mute()

    @sleeping.setter
    def sleeping(self, sleeping: bool):
        if self._sleeping == sleeping:
            return
        self._sleeping = sleeping
        self._update_mute()

    def _update_mute(self):
        if not self.can_act:
            self._try_timer.stop()
            self._force_timer.stop()
        else:
            self._try_timer.start()
            self._force_timer.start()
            self.enqueue(TryAction())

    def start(self) -> None:
        """Start the event processing loop in a separate thread."""
        if self._active:
            return
        self._active = True
        self._worker_thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._worker_thread.start()
        if not self._muted:
            self._try_timer.start()
            self._force_timer.start()

    def stop(self) -> None:
        """Stop the event processing loop."""
        if not self._active:
            return
        self._active = False
        self._try_timer.stop()
        self._force_timer.stop()
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
                self._logger.error(f"Error in event loop: {e}\nTraceback:\n{traceback.format_exc()}")
        finally:
            self._event_loop.close()
            self._event_loop = None

    async def _process_events(self) -> None:
        """Process events from the queue."""
        while self._active:
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
                self._logger.debug(f"Processing {type(event).__name__} event with priority {event.priority.name}")
                await self._handle_event(event)
            except Exception as e:
                self._logger.error(f"Error processing event: {e}\nTraceback:\n{traceback.format_exc()}")
            finally:
                self._busy = False
                self._queue.task_done()

    async def _handle_event(self, event: BaseEvent) -> None:
        """Handle a single event based on its type."""
        if isinstance(event, Context):
            await self.game.llm.context(
                event.ctx,
                silent=event.silent,
                ephemeral=event.ephemeral,
                persistent_llarry_only=event.persistent_llarry_only,
                notify=event.notify
            )
            if not event.silent:
                self.enqueue(TryAction())
        elif isinstance(event, TryAction):
            actions = event.actions or list(self.game.actions.values())
            allow_yapping = event.allow_yapping if event.allow_yapping is not None else CONFIG.gary.allow_yapping
            if not actions and not allow_yapping:
                self._logger.error("TryAction with nothing to do")
                return
            if not self.can_act:
                self._logger.info(f"TryAction event ignored - {'muted' if self.muted else 'sleeping'}")
                return
            act = await self.game.llm.try_action(actions, allow_yapping=allow_yapping)
            await self.game.execute_action(act)
        elif isinstance(event, ForceAction):
            if not self.can_act:
                self._logger.info(f"ForceAction event ignored - {'muted' if self.muted else 'sleeping'}")
                return
            if event.force_message:
                act = await self.game.llm.force_action(event.force_message)
            else:
                actions = list(self.game.actions.values())
                act = await self.game.llm.action(actions)
            await self.game.execute_action(act)
        elif isinstance(event, Say):
            if not event.message and not self.can_act:
                self._logger.warning(f"Tried to generate Say but {'muted' if self.muted else 'sleeping'} - Say event from {event.timestamp}")
                return
            await self.game.llm.say(message=event.message, ephemeral=event.ephemeral)
        elif isinstance(event, Sleep):
            async def sleep(duration: float):
                self.sleeping = True
                await asyncio.sleep(duration)
                self.sleeping = False
                self._logger.debug(f"Woke up from Sleep sent at {event.timestamp.time()}")
            sleep_until = event.timestamp.timestamp() + event.duration
            sleep_for = sleep_until - time.time()
            self._logger.debug(f"Sleeping for {sleep_for:.2f}s (Sleep for {event.duration:2f} sent at {event.timestamp.time()})")
            asyncio.create_task(sleep(sleep_for))
        else:
            self._logger.warning(f"Unknown event type: {type(event)}")

    async def _try(self) -> bool:
        if not self.game.actions and not CONFIG.gary.allow_yapping:
            self._logger.info(f"Idled for {self._try_timer.interval}s, but no actions")
            return True
        self._logger.warning(f"Idled for {self._try_timer.interval}s, trying action")
        return self.enqueue(TryAction())

    async def _force(self) -> bool:
        if not self.game.actions:
            self._logger.info(f"Didn't do anything for {self._force_timer.interval}s! But nothing to force")
            return True
        self._logger.error(f"Didn't do anything after {self._force_timer.interval}s! Forcing")
        return self.enqueue(ForceAction())

    def _on_context(self, *_):
        self._try_timer.reset()

    def _on_action(self, *_):
        self._force_timer.reset()
        self._try_timer.reset()

    def _on_say(self, said: str):
        # very sophisticated
        duration = len(said) * 0.1
        self.enqueue(Sleep(duration))
