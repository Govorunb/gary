import orjson
from loguru import logger
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState
from typing import TYPE_CHECKING, NamedTuple

from ..spec import *
from .utils import HasEvents

# python is just so lovely
if TYPE_CHECKING:
    from ..registry import Game

class CloseEvent(NamedTuple):
    code: int
    reason: str
    client_disconnected: bool

class WSConnection[TRecv: BaseModel, TSend: BaseModel](HasEvents[Literal['connect', 'disconnect', 'receive', 'send']]):
    def __init__(self, websocket: WebSocket, t_recv: TypeAdapter[TRecv], t_send: TypeAdapter[TSend]):
        super().__init__()
        self.ws = websocket
        self.id = uuid4().hex[:8]
        self.t_recv = t_recv
        self.t_send = t_send

        from ..registry import REGISTRY
        self.registry = REGISTRY
        self.subscribe('connect', lambda *_: self.registry.connect(self))
        self.subscribe('disconnect', lambda *_: self.registry.disconnect(self))

    def is_connected(self):
        return self.ws.client_state == WebSocketState.CONNECTED and self.ws.application_state == WebSocketState.CONNECTED

    async def disconnect(self, code: int = 1000, reason: str = "Disconnected"):
        if not self.is_connected():
            return
        await self.ws.close(code, reason)
        await self._raise_event('disconnect', code, reason, False)

    async def send(self, message: TSend):
        if not self.is_connected():
            logger.warning(f"Not connected, cannot send {message}")
            return
        text = orjson.dumps(message.model_dump(mode='json', by_alias=True)).decode()
        logger.trace(f"Sending: {text}")
        await self.ws.send_text(text)
        await self._raise_event('send', message)
    
    async def _send_raw(self, message: str):
        if not self.is_connected():
            logger.warning(f"Not connected, cannot send {message}")
            return
        logger.debug(f"Sending raw: {message}")
        await self.ws.send_text(message)

    async def receive(self) -> TRecv:
        text = await self.ws.receive_text()
        if not text:
            raise ValueError("Received empty message")
        logger.trace(f"Received: {text}")
        model = self.t_recv.validate_json(text, strict=True)
        await self._raise_event('receive', model)
        return model

    async def lifecycle(self):
        await self._raise_event('connect')
        close_event = CloseEvent(1000, "", False)
        try:
            while self.is_connected():
                await self.receive()
        except WebSocketDisconnect as wsd:
            logger.info(f"WebSocket disconnected: [{wsd.code}] {wsd.reason}")
            close_event = CloseEvent(wsd.code, wsd.reason, True)
        except Exception as e:
            logger.warning(f"Message handler error: ({type(e)}) {e}")
            close_event = CloseEvent(1011, "Internal error", False)
            await self.ws.close(close_event.code, close_event.reason)
            raise
        finally:
            await self._raise_event('disconnect', close_event)

class GameWSConnection(WSConnection[AnyGameMessage, AnyNeuroMessage]):
    def __init__(self, websocket: WebSocket, version: Literal["1", "2"], game_name: str | None = None):
        super().__init__(websocket, GameMessageAdapter, NeuroMessageAdapter)
        self.game: "Game | None" = None
        self.version = version
        self.game_name = game_name

        if self.version == "1":
            async def _v1_init_if_no_startup_msg(message: AnyGameMessage):
                if not self.game and isinstance(message, RegisterActions):
                    await self.registry.initiate(message.game, self)
            
            # IMPL: sent on every connect (not just reconnects)
            # in v2, game is expected to (re-)register on connect, backend is expected to unregister on disconnect
            async def _v1_send_reregisterall():
                await self.send(ReregisterAllActions())
            
            self.subscribe('connect', _v1_send_reregisterall)
            self.subscribe('receive', _v1_init_if_no_startup_msg)
        elif self.version == "2":
            assert game_name, "Game name is required for v2"
            async def v2_startup():
                await self.registry.initiate(game_name, self)
            self.subscribe('connect', v2_startup)

