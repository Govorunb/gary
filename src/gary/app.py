from contextlib import asynccontextmanager
from fastapi import FastAPI, Response, WebSocket, WebSocketDisconnect
from loguru import logger

from .util import GameWSConnection, GameWSConnectionV1, GameWSConnectionV2, configure_logging
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


@app.websocket("/") # v1 only
async def v1_legacy(*, websocket: WebSocket):
    return await game_ws(websocket=websocket, version="1")

@app.websocket("/v{version}") # v2+, exact route still in proposal - game would be in query
async def v2_game_in_query(*, websocket: WebSocket, version: str, game: str | None = None):
    return await game_ws(websocket=websocket, version=version, game=game)

@app.websocket("/v{version}/{game}") # v2+, alternative route (game in path rather than query)
async def v2_game_in_path(*, websocket: WebSocket, version: str, game: str):
    return await game_ws(websocket=websocket, version=version, game=game)

async def game_ws(*, websocket: WebSocket, version: str, game: str | None = None):
    connection: GameWSConnection

    if version == "1":
        connection = GameWSConnectionV1(websocket)
    elif version == "2":
        if not game:
            await websocket.send_denial_response(Response("Missing 'game' query parameter", status_code=400))
            return
        connection = GameWSConnectionV2(websocket, game)
    else:
        await websocket.send_denial_response(Response("Unsupported version", status_code=400))
        return

    await websocket.accept()
    logger.info(f"New connection {connection.id} from {websocket.client}")

    try:
        await connection.lifecycle()
        logger.info(f"Disconnected from {websocket.client}")
    except WebSocketDisconnect as e:
        logger.warning(f"{websocket.client} disconnected ([{e.code}] {e.reason})")
