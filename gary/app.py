from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .registry import REGISTRY
from .util import GameWSConnection, logger
from .util import ManagerWSConnection

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

@app.websocket("/manage")
async def manage_ws(websocket: WebSocket):
    connection = ManagerWSConnection(websocket)
    
    await websocket.accept()
    logger.info(f"Manager {connection.id} ({websocket.client}) connected")
    
    try:
        await connection.lifecycle()
        logger.info(f"Disconnected manager {websocket.client}")
    except WebSocketDisconnect as e:
        logger.error(f"Manager {websocket.client} disconnected ([{e.code}] {e.reason})")

@app.get("/games")
def get_games():
    return [
        {
            "name": name,
            "connection": {
                "id": game.connection.id,
                "client": f"{game.connection.ws.client.host}:{game.connection.ws.client.port}" if game.connection.ws.client else None,
            }
        }
        for name, game in REGISTRY.games.items()
    ]

@app.get("/managers")
def get_managers():
    return [
        {
            "id": conn.id,
            "client": f"{conn.ws.client.host}:{conn.ws.client.port}" if conn.ws.client else None,
        }
        for conn in REGISTRY.managers.values()
    ]

@app.get("/connections")
def connections():
    return {
        "games": get_games(),
        "managers": get_managers()
    }
