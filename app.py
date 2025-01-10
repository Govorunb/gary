from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from llm import LLM
from registry import Registry
from websocket import WebsocketConnection
from logger import logger

app = FastAPI()

_registry = None

active_connections: list[WebsocketConnection] = []

@app.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    global _registry
    if not _registry:
        _registry = Registry(LLM())
    await websocket.accept()
    logger.info(f"New connection from {websocket.client}")
    connection = WebsocketConnection(websocket)
    websocket.state.registry = _registry
    active_connections.append(connection)
    try:
        await connection.lifecycle()
        logger.info(f"Connection to {websocket.client} closed")
    except WebSocketDisconnect as e:
        logger.error(f"Connection closed unexpectedly ([{e.code}] {e.reason})")
        raise
    finally:
        _registry.llm.reset() # IMPL
        active_connections.remove(connection)
