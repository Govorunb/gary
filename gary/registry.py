from typing import * # type: ignore

from .util import CONFIG, logger, WebsocketConnection
from .util.config import ExistingConnectionPolicy
from .llm import LLM
from .scheduler import Scheduler
from .spec import *

class Registry:
    def __init__(self, *, existing_connection_policy: ExistingConnectionPolicy | None = None):
        self.games: MutableMapping[str, "Game"] = {}
        self.conflict_resolution = existing_connection_policy or CONFIG.gary.existing_connection_policy
    
    async def on_startup(self, msg: Startup, conn: WebsocketConnection):
        game = self.games.get(msg.game)
        if game is None:
            self.games[msg.game] = game = Game(msg.game, self, conn)
        else:
            # IMPL: game already connected
            if game.connection != conn:
                if game.connection.is_connected():
                    # IMPL: different active connection
                    logger.warning(f"Game {msg.game} received startup from {conn.ws.client}, but is already actively connected to {game.connection.ws.client}!")
                    conn_to_close = game.connection if self.conflict_resolution == ExistingConnectionPolicy.DISCONNECT_EXISTING else conn
                    logger.info(f"Disconnecting {conn_to_close.ws.client} according to policy {self.conflict_resolution}")
                    close_code = 1012 # Service Restart https://github.com/Luka967/websocket-close-codes
                    await conn_to_close.ws.close(close_code, "Game already connected")
                del game.connection.ws.state.game
        game.connection = conn
        game.connection.ws.state.game = game
        game.connected()
    
    async def handle(self, msg: AnyGameMessage, conn: WebsocketConnection):
        if isinstance(msg, Startup):
            await self.on_startup(msg, conn)
        else:
            if not (game := self.games.get(msg.game, None)):
                logger.warning(f"Game {msg.game} was somehow not connected, imitating a `startup`")
                # IMPL: pretend we got a `startup` if first msg after reconnect isn't `startup`
                await self.on_startup(Startup(game=msg.game), conn)
                await self.handle(msg, conn)
                return
            if game.connection != conn and game.connection.is_connected(): # IMPL
                logger.error(f"Game {msg.game} is registered to a different active connection! (was {game.connection.ws.client}; received '{msg.command}' from {conn.ws.client})")
            await game.handle(msg)

class Game:
    def __init__(self, name: str, registry: Registry, connection: WebsocketConnection):
        self.name = name
        self.registry = registry
        self.actions: dict[str, ActionModel] = {}
        self._seen_actions: set[str] = set()
        self.pending_actions: list[str] = [] # action IDs
        self.pending_forces: dict[str, ForceAction] = {}
        self.connection = connection
        self.llm = LLM(self)
        self.scheduler = Scheduler(self)
        
        connection.ws.state.registry = registry
        connection.ws.state.game = self

    async def action_register(self, actions: list[ActionModel]):
        for action in actions:
            # IMPL: overwrites existing actions
            if action.name in self.actions:
                logger.warning(f"Action {action.name} already registered")
            # small implementation quirk, BaseModel has a deprecated 'schema' method
            # and if no schema is sent it doesn't get overridden
            if isinstance(action.schema, Callable):
                action.schema = None
            else: # stop making up random fields in the data. i am no longer asking
                action.schema["additionalProperties"] = False # type: ignore
            self.actions[action.name] = action
            if action.name not in self._seen_actions:
                self._seen_actions.add(action.name)
                logger.info(f"New action {action.name}: {action.description}")
        logger.info(f"Actions registered: {list(self.actions.keys())}")
    
    async def action_unregister(self, actions: list[str]):
        for action_name in actions:
            self.actions.pop(action_name, None)
        logger.info(f"Actions unregistered: {actions}")
    
    async def try_action(self) -> bool:
        if not self.connection.is_connected():
            return False
        if not self.actions:
            logger.debug("No actions to try (Game.try_action)")
            return False
        if action := await self.llm.try_action(self.actions):
            await self.execute_action(*action)
            return True
        return False
    
    async def _force_any_action(self) -> bool:
        if not self.actions:
            logger.warning("No actions to force_any")
            return False
        if action := await self.llm.action(self.actions):
            await self.execute_action(*action)
            return True
        logger.warning("Tried force_any but no action. unlucky")
        return False

    async def execute_action(self, name: str, data: str | None = None, *, force: ForceAction | None = None):
        if name not in self.actions:
            logger.error(f"Executing unregistered action {name}")
        # IMPL: not validating data against stored action schema (guidance is just perfect like that (clueless))
        msg = Action(data=Action.Data(name=name, data=data))
        self.pending_actions.append(msg.data.id)
        if force:
            self.pending_forces[msg.data.id] = force
        self.llm.context(f"Executing action '{name}' with {{id: \"{msg.data.id[:5]}\", data: {msg.data.data}}}", silent=True)
        self.scheduler.on_action()
        await self.connection.send(msg)

    async def process_result(self, result: ActionResult):
        if result.data.id in self.pending_actions:
            self.pending_actions.remove(result.data.id)
            # IMPL: there SHOULD be a message on failure, but success doesn't require one
            ctx = f"Result for action {result.data.id[:5]}: {"Performing" if result.data.success else "Failure"} ({result.data.message or 'no message'})"
            is_force = bool(force := self.pending_forces.pop(result.data.id, None))
            await self.send_context(ctx, silent=result.data.success or is_force) # IMPL: will try acting again if failed
            # IMPL: not checking whether the actions in the previous force are still registered
            # i have no idea if it's guaranteed by the spec or not
            if is_force and not result.data.success:
                await self.handle(force)
        else: # IMPL: result for unknown action
            logger.warning(f"Received result for unknown action {result.data.id}")
    
    async def send_context(self, msg: str, silent: bool = False, ephemeral: bool = False, do_print: bool = True):
        self.llm.context(msg, silent, ephemeral=ephemeral, do_print=do_print)
        if not silent and not await self.try_action():
            self.scheduler.on_context()

    async def handle(self, msg: AnyGameMessage):
        logger.debug(f'Handling {msg.command}')
        if isinstance(msg, RegisterActions):
            await self.action_register(msg.data.actions)
        elif isinstance(msg, UnregisterActions):
            await self.action_unregister(msg.data.action_names)
        elif isinstance(msg, Context):
            await self.send_context(msg.data.message, msg.data.silent)
        elif isinstance(msg, ForceAction):
            chosen_action, data = await self.llm.force_action(msg, self.actions)
            await self.execute_action(chosen_action, data, force=msg)
        elif isinstance(msg, ActionResult):
            await self.process_result(msg)
        else:
            raise Exception(f"Unhandled message type {type(msg)}")
        
    async def disconnect(self, code: int = 1000, reason: str = "Disconnected"):
        if self.connection.is_connected():
            await self.connection.ws.close(code, reason)
        else:
            logger.warning(f"Game {self.name} already disconnected")

    def connected(self):
        self.llm.gaming()
        self.scheduler.start()

    def on_disconnect(self):
        self.reset()
        self.llm.reset() # TODO: config whether to reset on disconnect
    
    def reset(self):
        self.llm.not_gaming()
        self.scheduler.stop()
        self._seen_actions.clear()
        self.actions.clear()
        self.pending_actions.clear()
        self.pending_forces.clear()
