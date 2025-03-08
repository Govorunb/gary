import orjson

from loguru import logger
from pydantic import BaseModel, TypeAdapter
from typing import NamedTuple, Literal
from websockets import ClientConnection, ConnectionClosed, State

from gary.spec import *
from gary.util.utils import HasEvents

class CloseEvent(NamedTuple):
    code: int
    reason: str
    server_disconnected: bool

class WSConnection[TRecv: BaseModel, TSend: BaseModel](HasEvents[Literal['connect', 'disconnect', 'receive', 'send']]):
    def __init__(self, ws: ClientConnection, t_recv: TypeAdapter[TRecv], t_send: TypeAdapter[TSend]):
        super().__init__()
        self.ws = ws
        self.t_recv = t_recv
        self.t_send = t_send

    def is_connected(self):
        return self.ws.state == State.OPEN

    async def disconnect(self, code: int = 1000, reason: str = "Disconnected"):
        if not self.is_connected():
            return
        await self.ws.close(code, reason)
        await self._raise_event('disconnect', code, reason, False)

    async def send(self, message: TSend):
        if not self.is_connected():
            logger.warning(f"Not connected, cannot send {message}")
            return
        text = orjson.dumps(message.model_dump(mode='json', by_alias=True))
        logger.trace(f'Sending: {text}')
        await self.ws.send(text, text=True)
        await self._raise_event('send', message)

    @logger.catch(reraise=True)
    async def receive(self) -> TRecv:
        text = await self.ws.recv(True)
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
        except ConnectionClosed as cc:
            logger.info(f"WebSocket disconnected: [{cc.code}] {cc.reason}")
            close_event = CloseEvent(cc.code, cc.reason, True)
        except Exception:
            close_event = CloseEvent(1011, "Internal error", False)
            if self.is_connected():
                logger.warning("Disconnecting due to error")
                await self.ws.close(close_event.code, close_event.reason)
            else:
                logger.info("Server already disconnected")
                close_event = close_event._replace(server_disconnected=True)
            raise
        finally:
            await self._raise_event('disconnect', close_event)

class Connection(WSConnection[AnyNeuroMessage, AnyGameMessage]):
    def __init__(self, ws: ClientConnection):
        super().__init__(ws, TypeAdapter(AnyNeuroMessage), TypeAdapter(AnyGameMessage))
