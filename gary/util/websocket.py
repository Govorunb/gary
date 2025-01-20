import json
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from ..spec import *
from .logger import logger

# python is just so lovely
if TYPE_CHECKING:
    from ..registry import Game, Registry
    from ..web.manager import ManagerWSConnection

class WSConnection[TRecv: BaseModel, TSend: BaseModel]:
    def __init__(self, websocket: WebSocket, t_recv: TypeAdapter[TRecv], t_send: TypeAdapter[TSend]):
        self.ws = websocket
        self.id = uuid4().hex[:8]
        self.t_recv = t_recv
        self.t_send = t_send

        from ..registry import REGISTRY
        self.ws.state.registry = REGISTRY

    def registry(self) -> "Registry":
        return self.ws.state.registry

    def game(self) -> "Game | None":
        return self._state("game")

    def _state(self, key: str):
        return self.ws.state.__getattr__(key) if hasattr(self.ws.state, key) else None

    def is_connected(self):
        return self.ws.client_state == WebSocketState.CONNECTED and self.ws.application_state == WebSocketState.CONNECTED

    async def disconnect(self, code: int = 1000, reason: str = "Disconnected"):
        await self.ws.close(code, reason)

    async def send(self, message: TSend):
        if not self.is_connected():
            logger.warning(f"Not connected, cannot send {message}")
            return
        text = json.dumps(message.model_dump(mode='json'))
        # logger.debug(f'Sending: {text}')
        await self.ws.send_text(text)

    async def receive(self) -> TRecv:
        text = await self.ws.receive_text()
        # logger.debug(f'Received: {text}')
        return self.t_recv.validate_json(text, strict=True)

    async def lifecycle(self):
        await self.on_connect()
        try:
            while self.is_connected():
                msg = await self.receive()
                await self.handle(msg)
        except Exception as e:
            logger.debug(f"Disconnecting: {e}")
            if isinstance(e, WebSocketDisconnect):
                logger.info(f"WebSocket disconnected: [{e.code}] {e.reason}")
            else:
                logger.warning(f"Message handler error: ({type(e)}) {e}")
                raise
        finally:
            await self.on_disconnect()

    async def handle(self, message: TRecv):
        raise NotImplementedError

    async def on_connect(self):
        pass
    async def on_disconnect(self):
        pass

class GameWSConnection(WSConnection[AnyGameMessage, AnyNeuroMessage]):
    def __init__(self, websocket: WebSocket):
        super().__init__(websocket, GameMessageAdapter, NeuroMessageAdapter)

    async def handle(self, message: AnyGameMessage):
        if not self.is_connected():
            logger.warning(f"Not connected, cannot handle {message}")
            return
        if not self.game() and isinstance(message, RegisterActions):
            await self.registry().on_startup(Startup(game=message.game), self)
        await self.registry().handle(message, self)

    async def on_connect(self):
        # IMPL: sent on every connect (not just reconnects)
        await self.send(ReregisterAllActions())
        await super().on_connect()

    async def on_disconnect(self):
        if game := self.game():
            game.on_disconnect()
        await super().on_disconnect()

    def manager(self) -> "ManagerWSConnection | None":
        return self._state("manager")

    async def send(self, message: AnyNeuroMessage):
        await super().send(message)
        if manager := self.manager():
            await manager.on_sent(message)
    
    async def receive(self) -> AnyGameMessage:
        message = await super().receive()
        if manager := self.manager():
            await manager.on_received(message)
        return message