import orjson
import logging

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState
from typing import TYPE_CHECKING, NamedTuple

from ..spec import *
from .utils import HasEvents

_logger = logging.getLogger(__name__)

# python is just so lovely
if TYPE_CHECKING:
    from ..registry import Game

class WSConnection[TRecv: BaseModel, TSend: BaseModel](HasEvents[Literal["connect", "disconnect", "receive", "send"]]):
    def __init__(self, websocket: WebSocket, t_recv: TypeAdapter[TRecv], t_send: TypeAdapter[TSend]):
        super().__init__()
        self.ws = websocket
        self.id = uuid4().hex[:8]
        self.t_recv = t_recv
        self.t_send = t_send

        from ..registry import REGISTRY
        self.registry = REGISTRY
        self.subscribe("connect", lambda *_: self.registry.connect(self))
        self.subscribe("disconnect", lambda *_: self.registry.disconnect(self))

    def is_connected(self):
        return self.ws.client_state == WebSocketState.CONNECTED and self.ws.application_state == WebSocketState.CONNECTED

    async def disconnect(self, code: int = 1000, reason: str = "Disconnected"):
        if not self.is_connected():
            return
        await self.ws.close(code, reason)
        await self._raise_event("disconnect", code, reason, False)

    async def send(self, message: TSend):
        if not self.is_connected():
            _logger.warning(f"Not connected, cannot send {message}")
            return
        text = orjson.dumps(message.model_dump(mode='json')).decode()
        # _logger.debug(f'Sending: {text}')
        await self.ws.send_text(text)
        await self._raise_event("send", message)

    async def receive(self) -> TRecv:
        text = await self.ws.receive_text()
        if not text:
            raise ValueError("Received empty message")
        # _logger.debug(f'Received: {text}')
        model = self.t_recv.validate_json(text, strict=True)
        await self._raise_event("receive", model)
        return model

    async def lifecycle(self):
        await self._raise_event("connect")
        CloseEvent = NamedTuple("CloseEvent", [("code", int), ("reason", str), ("client_disconnected", bool)])
        close_event = CloseEvent(1000, "", False)
        try:
            while self.is_connected():
                await self.receive()
        except Exception as e:
            _logger.debug(f"Disconnecting: {e}")
            if isinstance(e, WebSocketDisconnect):
                _logger.info(f"WebSocket disconnected: [{e.code}] {e.reason}")
                close_event = CloseEvent(e.code, e.reason, True)
            else:
                _logger.warning(f"Message handler error: ({type(e)}) {e}")
                close_event = CloseEvent(1011, "Internal error", False)
                await self.ws.close(close_event.code, close_event.reason)
                raise
        finally:
            await self._raise_event("disconnect", close_event)

class GameWSConnection(WSConnection[AnyGameMessage, AnyNeuroMessage]):
    def __init__(self, websocket: WebSocket):
        super().__init__(websocket, GameMessageAdapter, NeuroMessageAdapter)
        self.game: "Game | None" = None

        # IMPL: sent on every connect (not just reconnects)
        self.subscribe('connect', self._send_reregisterall)
        self.subscribe('receive', self.handle)

    async def handle(self, message: AnyGameMessage):
        if not self.game and isinstance(message, RegisterActions):
            await self.registry.startup(Startup(game=message.game), self)

    async def _send_reregisterall(self):
        await self.send(ReregisterAllActions())
