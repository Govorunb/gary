from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .util import WebsocketConnection, logger

app = FastAPI()

active_connections: list[WebsocketConnection] = []

@app.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info(f"New connection from {websocket.client}")
    connection = WebsocketConnection(websocket)
    active_connections.append(connection)
    try:
        await connection.lifecycle()
        logger.info(f"Disconnected from {websocket.client}")
    except WebSocketDisconnect as e:
        logger.error(f"{websocket.client} disconnected ([{e.code}] {e.reason})")
    finally:
        active_connections.remove(connection)
