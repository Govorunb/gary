from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .util import GameWSConnection, logger

app = FastAPI()


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
