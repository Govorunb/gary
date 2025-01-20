import json
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from ..spec import *
from ..web.manager_spec import *
from .logger import logger

# python is just so lovely
if TYPE_CHECKING:
    from ..registry import Game

class WSConnection[TRecv: BaseModel, TSend: BaseModel]:
    def __init__(self, websocket: WebSocket, t_recv: TypeAdapter[TRecv], t_send: TypeAdapter[TSend]):
        self.ws = websocket
        self.id = uuid4().hex[:8]
        self.t_recv = t_recv
        self.t_send = t_send

        from ..registry import REGISTRY
        self.registry = REGISTRY

    def is_connected(self):
        return self.ws.client_state == WebSocketState.CONNECTED and self.ws.application_state == WebSocketState.CONNECTED

    async def disconnect(self, code: int = 1000, reason: str = "Disconnected"):
        if not self.is_connected():
            return
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
        self.registry.connect(self)
    async def on_disconnect(self):
        self.registry.disconnect(self)

class GameWSConnection(WSConnection[AnyGameMessage, AnyNeuroMessage]):
    def __init__(self, websocket: WebSocket):
        super().__init__(websocket, GameMessageAdapter, NeuroMessageAdapter)
        self.game: "Game | None" = None

    async def handle(self, message: AnyGameMessage):
        if not self.is_connected():
            logger.warning(f"Not connected, cannot handle {message}")
            return
        if not self.game and isinstance(message, RegisterActions):
            await self.registry.on_startup(Startup(game=message.game), self)
        await self.registry.handle(message, self)

    async def on_connect(self):
        await super().on_connect()
        # IMPL: sent on every connect (not just reconnects)
        await self.send(ReregisterAllActions())

    async def on_disconnect(self):
        if self.game:
            self.game.on_disconnect()
        await super().on_disconnect()

    async def send(self, message: AnyNeuroMessage):
        await super().send(message)
        for manager in self.registry.managers.values():
            await manager.on_sent(self, message)

    async def receive(self) -> AnyGameMessage:
        message = await super().receive()
        for manager in self.registry.managers.values():
            await manager.on_received(self, message)
        return message

class ManagerWSConnection(WSConnection):
    def __init__(self, manager_ws: WebSocket):
        super().__init__(manager_ws, ClientMessageAdapter, ServerMessageAdapter)
        self.manager_ws = manager_ws

    async def force_send_to_game(self, game: str, message: AnyNeuroMessage):
        await self.connection_for_game(game).send(message)

    async def fake_receive_from_game(self, message: AnyGameMessage):
        conn = self.connection_for_game(message.game)
        await self.registry.handle(message, conn)

    def connection_for_game(self, game: str):
        if (game_conn := self.registry.connections.get(game, None)) and isinstance(game_conn, GameWSConnection):
            return game_conn
        elif game_ := self.registry.games.get(game, None):
            return game_.connection
        else:
            raise Exception(f"Game {game} not found")

    async def handle(self, message: AnyClientMessage):
        match message:
            case SendToGame():
                await self.force_send_to_game( message.game, message.message)
            case ReceiveFromGame():
                await self.fake_receive_from_game(message.message)
            case _:
                raise Exception(f"Unhandled message type {type(message)}")

    async def on_sent(self, conn: GameWSConnection, message: AnyNeuroMessage):
        await self.send(MessageSent(game=conn.id, message=message))

    async def on_received(self, conn: GameWSConnection, message: AnyGameMessage):
        await self.send(MessageReceived(game=conn.id, message=message))
