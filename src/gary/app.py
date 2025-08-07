from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from loguru import logger


from .util import GameWSConnection, configure_logging
from .util.config import PRESET
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
if PRESET != 'default':
    logger.info(f"Using preset '{PRESET}'")
app = FastAPI(lifespan=lifespan)


@app.websocket("/")
async def game_ws(websocket: WebSocket):
    connection = GameWSConnection(websocket)

    await websocket.accept()
    logger.info(f"New connection {connection.id} from {websocket.client}")

    try:
        await connection.lifecycle()
        logger.info(f"Disconnected from {websocket.client}")
    except WebSocketDisconnect as e:
        logger.warning(f"{websocket.client} disconnected ([{e.code}] {e.reason})")
