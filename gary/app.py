from fastapi import FastAPI, Response, WebSocket, WebSocketDisconnect

from .web.manager import ManagerWSConnection

from .util import GameWSConnection, logger

app = FastAPI()

active_game_connections: dict[str, GameWSConnection] = {}
active_manage_connections: dict[str, ManagerWSConnection] = {}

@app.websocket("/")
async def game_ws(websocket: WebSocket):
    connection = GameWSConnection(websocket)
    if connection.id in active_game_connections:
        logger.error(f"Rolled duplicate connection ID {connection.id} - from {connection.ws.client}, already belongs to {active_game_connections[connection.id].ws.client}")
        return Response(status_code=409)
    
    await websocket.accept()
    logger.info(f"New connection {connection.id} from {websocket.client}")
    active_game_connections[connection.id] = connection
    
    try:
        await connection.lifecycle()
        logger.info(f"Disconnected from {websocket.client}")
    except WebSocketDisconnect as e:
        logger.warning(f"{websocket.client} disconnected ([{e.code}] {e.reason})")
    finally:
        if not active_game_connections.pop(connection.id, None):
            logger.warning(f"Connection {connection.id} already deleted")
        if (manager := active_manage_connections.pop(connection.id, None)):
            await manager.disconnect(reason="Game disconnected")

@app.websocket("/manage/{conn}")
async def manage_ws(websocket: WebSocket, conn):
    if not (game_conn := active_game_connections.get(conn, None)):
        logger.warning(f"Request from {websocket.client} to manage non-existent game {conn}")
        return Response(status_code=404)
    if existing := active_manage_connections.get(conn, None):
        logger.warning(f"Request from {websocket.client} to manage game {conn} already managed by {existing.manager_ws.client}")
        return Response(status_code=409)
    
    await websocket.accept()
    logger.info(f"{websocket.client} connected to manage {conn}")
    connection = ManagerWSConnection(websocket, game_conn)
    
    try:
        await connection.lifecycle()
        logger.info(f"Disconnected manager {websocket.client}")
    except WebSocketDisconnect as e:
        logger.error(f"Manager {websocket.client} disconnected ([{e.code}] {e.reason})")
    finally:
        if not active_manage_connections.pop(conn, None):
            logger.warning(f"Manager for {conn} already deleted")

@app.get("/connections")
async def connections():
    return [id for id in active_game_connections.keys() if id not in active_manage_connections]
