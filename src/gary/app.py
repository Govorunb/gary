from contextlib import asynccontextmanager
from fastapi import FastAPI, Response, WebSocket, WebSocketDisconnect
from loguru import logger

from .util import GameWSConnection, configure_logging
from .web.ui import add_control_panel

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.debug("Starting Panel server")
    panel_server = add_control_panel('/')
    yield
    logger.debug("Shutting down Panel server")
    panel_server.stop()
    logger.debug("Cleaning up games")
    from .registry import REGISTRY
    await REGISTRY.destroy()

configure_logging()
app = FastAPI(lifespan=lifespan)


SUPPORTED_API_VERSIONS = ("1", "2")

@app.websocket("/")
@app.websocket("/v{version}")
@app.websocket("/v{version}/{game}")
async def game_ws(*, websocket: WebSocket, version: str = "1", game: str | None = None):
    if version not in SUPPORTED_API_VERSIONS:
        await websocket.send_denial_response(Response("Unsupported version", status_code=400))
        return
    if version == "2" and not game:
        await websocket.send_denial_response(Response("Missing 'game' query parameter", status_code=400))
        return
    connection = GameWSConnection(websocket, version, game)

    await websocket.accept()
    logger.info(f"New connection {connection.id} from {websocket.client}")

    try:
        await connection.lifecycle()
        logger.info(f"Disconnected from {websocket.client}")
    except WebSocketDisconnect as e:
        logger.warning(f"{websocket.client} disconnected ([{e.code}] {e.reason})")
