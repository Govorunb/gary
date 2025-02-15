import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .util import GameWSConnection
from .web.ui import add_control_panel

_logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    _logger.debug("Starting Panel server")
    panel_server = add_control_panel('/')
    yield
    _logger.debug("Shutting down Panel server")
    panel_server.stop()

app = FastAPI(lifespan=lifespan)


@app.websocket("/")
async def game_ws(websocket: WebSocket):
    connection = GameWSConnection(websocket)

    await websocket.accept()
    _logger.info(f"New connection {connection.id} from {websocket.client}")

    try:
        await connection.lifecycle()
        _logger.info(f"Disconnected from {websocket.client}")
    except WebSocketDisconnect as e:
        _logger.warning(f"{websocket.client} disconnected ([{e.code}] {e.reason})")
