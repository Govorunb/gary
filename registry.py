from enum import Enum
from typing import * # type: ignore
from logger import logger

from config import LLM_FLAGS, LLMConfig
from llm import LLM
from spec import *
from websocket import WebsocketConnection

class Registry:
    class ConflictResolution(Enum):
        DISCONNECT_NEW = 1
        DISCONNECT_EXISTING = 2

    def __init__(self, llm: LLM, *, conflict_resolution: ConflictResolution = ConflictResolution.DISCONNECT_EXISTING):
        self.games: MutableMapping[str, "Game"] = {}
        self.llm = llm
        self.conflict_resolution = conflict_resolution
    
    async def on_startup(self, msg: Startup, conn: WebsocketConnection):
        self.llm.gaming(msg.game)
        game = self.games.get(msg.game)
        if game is None:
            self.games[msg.game] = game = Game(msg.game, self, conn)
        else:
            # IMPL: game already connected
            logger.warning(f"Game {msg.game} already connected")
            if game.connection != conn and game.connection.is_connected():
                # IMPL: different active connection
                logger.warning(f"Game {msg.game} is actively connected to someone else! (was {game.connection.ws.client}; received '{msg.command}' from {conn.ws.client})")
                conn_to_close = game.connection if self.conflict_resolution == Registry.ConflictResolution.DISCONNECT_EXISTING else conn
                close_code = 1012 # Service Restart https://github.com/Luka967/websocket-close-codes
                await conn_to_close.ws.close(close_code, "Game already connected")
            del game.connection.ws.state.game
        game.connection = conn
        game.connection.ws.state.game = game
    
    async def handle(self, msg: AnyGameMessage, conn: WebsocketConnection):
        if isinstance(msg, Startup):
            await self.on_startup(msg, conn)
        else:
            game = self.games.get(msg.game)
            if game is None:
                logger.warning(f"Game {msg.game} not connected, faking a `startup`")
                # IMPL: pretend we got a `startup` if first msg after reconnect isn't `startup`
                # IMPL: timing for `actions/reregister_all`
                await self.on_startup(Startup(game=msg.game), conn)
                await conn.send(ReregisterAllActions())
                await self.handle(msg, conn)
                return
            if game.connection != conn: # IMPL
                logger.error(f"Game {msg.game} is registered to a different active connection! (was {game.connection.ws.client}; received '{msg.command}' from {conn.ws.client})")
            await game.handle(msg)

    async def disconnect(self, game: str):
        _game = self.games.pop(game, None)
        if _game is None or not _game.connection.is_connected(): # IMPL
            logger.warning(f"Game {game} already disconnected")
            return
        await _game.connection.ws.close(1000, "Disconnected")

class Game:
    def __init__(self, name: str, registry: Registry, connection: WebsocketConnection):
        self.name = name
        self.registry = registry
        self.actions: dict[str, ActionModel] = {}
        self.pending_actions: list[str] = [] # action IDs
        self.connection = connection
        connection.ws.state.registry = registry
        connection.ws.state.game = self

    async def action_register(self, actions: list[ActionModel]):
        for action in actions:
            # IMPL: overwriting registered actions
            if action.name in self.actions:
                logger.warning(f"Action {action.name} already registered")
            # small implementation quirk, BaseModel has a deprecated 'schema' method
            # and if no schema is sent it doesn't get overridden
            if isinstance(action.schema, Callable):
                action.schema = None
            self.actions[action.name] = action
            logger.info(f"Registered action {action.name}")
        if LLMConfig.TRY_ON_REGISTER in LLM_FLAGS and self.actions:
            self.registry.llm.context(self.name, f"Actions registered: {list(self.actions.keys())}")
            await self.try_action()
    
    async def action_unregister(self, actions: list[str]):
        for action_name in actions:
            if action_name in self.actions:
                del self.actions[action_name]
                logger.info(f"Unregistered action {action_name}")
    
    async def try_action(self):
        if not self.actions:
            return
        action = await self.registry.llm.try_action(self.name, self.actions)
        if action is not None:
            await self.execute_action(*action)

    async def execute_action(self, name: str, data: str | None = None):
        action = self.actions.get(name, None)
        if action is None:
            raise Exception(f"Action {name} not registered")
        # IMPL: not validating data against stored action schema
        msg = Action(data=Action.Data(name=name, data=data))
        self.pending_actions.append(msg.data.id)
        self.registry.llm.context(self.name, f"Executing action '{name}' with {{id: \"{msg.data.id}\", data: {msg.data.data}}}")
        await self.connection.send(msg)

    async def process_result(self, result: ActionResult):
        if result.data.id in self.pending_actions:
            self.pending_actions.remove(result.data.id)
            self.registry.llm.context(result.game, f"Result for action {result.data.id}: {result.data.message or "Success"}")
            await self.try_action() # IMPL: action loop
        else: # IMPL: result for unknown action
            logger.warning(f"Received result for unknown action {result.data.id}")

    async def handle(self, msg: AnyGameMessage):
        logger.debug(f'Handling {msg.command}')
        if isinstance(msg, RegisterActions):
            await self.action_register(msg.data.actions)
        elif isinstance(msg, UnregisterActions):
            await self.action_unregister(msg.data.action_names)
        elif isinstance(msg, Context):
            self.registry.llm.context(msg.game, msg.data.message, msg.data.silent)
            if not msg.data.silent:
                await self.try_action()
        elif isinstance(msg, ForceAction):
            chosen_action, data = await self.registry.llm.force_action(msg, self.actions)
            await self.execute_action(chosen_action, data)
        elif isinstance(msg, ActionResult):
            await self.process_result(msg)
        else:
            raise Exception(f"Unhandled message type {type(msg)}")
