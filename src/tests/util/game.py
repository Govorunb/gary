from collections.abc import Awaitable, Callable
from loguru import logger
from typing import overload

from websockets import ClientConnection

from gary.util import HasEvents
from gary.spec import *
from ..util import Connection

type Handler = Callable[[str, Any], Awaitable[tuple[bool, str]]]

# duplicated from gary.registry to avoid importing guidance/llama-cpp/everything else
type GameEvents = Literal["connect", "disconnect"] | GameCommand | NeuroCommand

class Game(HasEvents[GameEvents]):
    def __init__(self, name: str, ws: Connection | ClientConnection):
        super().__init__()
        self.ws = ws if isinstance(ws, Connection) else Connection(ws)
        self.name = name
        self.actions: dict[str, ActionModel] = {}
        self.ws.subscribe('receive', self._handler)
        self._sent_hello = False

    def make_msg(self, cls: type[AnyGameMessage], **kw):
        return cls(game=self.name, **kw)

    @overload
    async def send(self, msg: AnyGameMessage): ...
    @overload
    async def send(self, msg: type[AnyGameMessage], **kw): ...
    async def send(self, msg: AnyGameMessage | type[AnyGameMessage], **kw):
        if not self._sent_hello:
            self._sent_hello = True
            await self.send(Startup)
        message = self.make_msg(msg, **kw) if isinstance(msg, type) else msg
        if not self.ws.is_connected():
            logger.warning(f"Not connected, cannot send {message}")
            return
        await self.ws.send(message)
        await self._raise_event(message.command, message)

    async def _handler(self, msg: AnyNeuroMessage):
        await self._raise_event(msg.command, msg)
