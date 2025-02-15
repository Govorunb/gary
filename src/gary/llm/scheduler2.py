from queue import Empty, PriorityQueue
import asyncio
import threading
from typing import TYPE_CHECKING

from ..util import CONFIG, logger
from .events import BaseEvent, Context, TryAction, ForceAction, Say, Sleep

if TYPE_CHECKING:
    from ..registry import Game

class Scheduler2:
    def __init__(self, game: "Game"):
        self._queue: PriorityQueue[BaseEvent] = PriorityQueue()
        self._game = game
        self._active = False
        self._busy = False
        self._event_loop: asyncio.AbstractEventLoop | None = None
        self._worker_thread: threading.Thread | None = None
        self._logger = logger.getChild(__name__)

    def start(self) -> None:
        """Start the event processing loop in a separate thread."""
        if self._active:
            return
        self._active = True
        self._worker_thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._worker_thread.start()

    def stop(self) -> None:
        """Stop the event processing loop."""
        if not self._active:
            return
        self._active = False
        if self._event_loop:
            self._event_loop.call_soon_threadsafe(self._event_loop.stop)
        if self._worker_thread:
            self._worker_thread.join()
        self._event_loop = None
        self._worker_thread = None

    def add_event(self, event: BaseEvent) -> None:
        """Add an event to the queue.
        
        Events are processed in priority order (lower priority value = higher priority).
        Within the same priority level, events are processed in FIFO order.
        """
        self._queue.put_nowait(event)
        # Wake up the event loop if it's waiting
        if self._event_loop:
            self._event_loop.call_soon_threadsafe(self._process_events)

    def get_event(self) -> BaseEvent | None:
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

            event = self.get_event()
            if not event:
                # If no events, wait a bit before checking again
                await asyncio.sleep(0.1)
                continue

            try:
                self._busy = True
                self._logger.debug(f"Processing {type(event).__name__} event with priority {event.priority.name}")
                await self._handle_event(event)
            except Exception as e:
                self._logger.error(f"Error processing event: {e}")
            finally:
                self._busy = False
                self._queue.task_done()

    async def _handle_event(self, event: BaseEvent) -> None:
        """Handle a single event based on its type."""
        if isinstance(event, Context):
            await self._game.llm.context(
                event.ctx,
                silent=event.silent,
                ephemeral=event.ephemeral,
                persistent_llarry_only=event.persistent_llarry_only,
                notify=event.notify
            )
        elif isinstance(event, TryAction):
            actions = event.actions or self._game.actions
            allow_yapping = event.allow_yapping if event.allow_yapping is not None else CONFIG.gary.allow_yapping
            await self._game.llm.try_action(actions, allow_yapping=allow_yapping)
        elif isinstance(event, ForceAction):
            if event.force_message:
                await self._game.llm.force_action(event.force_message, self._game.actions)
            else:
                await self._game._force_any_action()
        elif isinstance(event, Say):
            if event.message:
                # TODO: Implement direct message sending
                self._logger.warning("Direct message sending not yet implemented")
            await self._game.llm.say()
        elif isinstance(event, Sleep):
            await asyncio.sleep(event.duration)
        else:
            self._logger.warning(f"Unknown event type: {type(event)}")
