
from fastapi import WebSocket

from ..util import GameWSConnection, WSConnection
from ..spec import AnyNeuroMessage, AnyGameMessage
from .spec import *

class ManagerWSConnection(WSConnection):
    def __init__(self, manager_ws: WebSocket, game_connection: GameWSConnection):
        super().__init__(manager_ws, ClientMessageAdapter, ServerMessageAdapter)
        self.manager_ws = manager_ws
        self.game_connection = game_connection

        game_connection.ws.state.manager = self
        manager_ws.state.game = game_connection

    async def force_send_to_game(self, message: AnyNeuroMessage):
        await self.game_connection.send(message)
    
    async def fake_receive_from_game(self, message: AnyGameMessage):
        await self.game_connection.handle(message)

    async def handle(self, message: AnyClientMessage):
        if isinstance(message, ReceiveFromGame):
            await self.fake_receive_from_game(message.message)
        elif isinstance(message, SendToGame):
            await self.force_send_to_game(message.message)
        else:
            raise Exception(f"Unhandled message type {type(message)}")
    
    async def on_sent(self, message: AnyNeuroMessage):
        await self.send(MessageSent(message=message))
    
    async def on_received(self, message: AnyGameMessage):
        await self.send(MessageReceived(message=message))
