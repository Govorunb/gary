import json
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from ..spec import *
from .logger import logger

# python is just so lovely
if TYPE_CHECKING:
    from registry import Game, Registry

class WebsocketConnection:
    def __init__(self, websocket: WebSocket):
        self.ws = websocket
        from ..registry import REGISTRY
        self.ws.state.registry = REGISTRY

    def registry(self) -> "Registry":
        return self.ws.state.registry
    
    def game(self) -> "Game | None":
        return self.ws.state.game if hasattr(self.ws.state, 'game') else None

    async def receive(self) -> AnyGameMessage:
        text = await self.ws.receive_text()
        # logger.debug(f'Received: {text}')
        return GameMessageAdapter.validate_json(text, strict=True)

    async def send(self, message: AnyNeuroMessage):
        if not self.is_connected():
            logger.warning(f"Not connected, cannot send {message}")
            return
        text = json.dumps(message.model_dump(mode='json'))
        # logger.debug(f'Sending: {text}')
        await self.ws.send_text(text)
    
    def is_connected(self):
        return self.ws.client_state == WebSocketState.CONNECTED and self.ws.application_state == WebSocketState.CONNECTED

    async def lifecycle(self):
        init = True
        while self.is_connected():
            try:
                # IMPL: sent on every connect (not just reconnects)
                if init:
                    await self.send(ReregisterAllActions())
                # FIXME: LLM generation is synchronous and hangs the websocket (Abandoned Pub disconnects)
                msg = await self.receive()
                if init and isinstance(msg, RegisterActions):
                    await self.registry().on_startup(Startup(game=msg.game), self)
                init = False
                await self.registry().handle(msg, self)
            except Exception as e:
                logger.debug(f"Disconnecting: {e}")
                if game := self.game():
                    game.on_disconnect()
                if isinstance(e, WebSocketDisconnect):
                    logger.info(f"WebSocket disconnected: [{e.code}] {e.reason}")
                else:
                    logger.warning(f"Message handler error: ({type(e)}) {e}")
                    raise
