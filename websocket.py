import json
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from spec import *
from logger import logger

# python is just so lovely
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from registry import Game, Registry

class WebsocketConnection:
    def __init__(self, websocket: WebSocket):
        self.ws = websocket

    def registry(self) -> "Registry":
        return self.ws.state.registry
    
    def game(self) -> "Game | None":
        return self.ws.state.game if hasattr(self.ws.state, 'game') else None

    async def receive(self) -> AnyGameMessage:
        text = await self.ws.receive_text()
        # logger.debug(f'Received: {text}')
        return GameMessageAdapter.validate_json(text, strict=True)

    async def send(self, message: AnyNeuroMessage):
        text = json.dumps(message.model_dump(mode='json'))
        logger.debug(f'Sending: {text}')
        await self.ws.send_text(text)
    
    def is_connected(self):
        return self.ws.client_state == WebSocketState.CONNECTED and self.ws.application_state == WebSocketState.CONNECTED

    async def lifecycle(self):
        while self.is_connected():
            try:
                msg = await self.receive()
                await self.registry().handle(msg, self)
            except Exception as e:
                if game := self.game():
                    self.registry().llm.not_gaming(game.name)
                    game.scheduler.stop()
                if isinstance(e, WebSocketDisconnect):
                    logger.info(f"WebSocket disconnected: [{e.code}] {e.reason}")
                else:
                    logger.warning(f"Message handler error: ({type(e)}) {e}")
                    raise
