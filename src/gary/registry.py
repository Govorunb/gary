import orjson
from functools import partial
from loguru import logger

from .llm.llm import SENDER_SYSTEM

from .util import CONFIG, WSConnection, GameWSConnection, HasEvents
from .util.config import ConflictResolutionPolicy
from .llm import LLM, Scheduler, Act
from .llm.events import Context as ContextEvent, TryAction, ForceAction as ForceActionEvent
from .spec import *

class Registry(HasEvents[Literal["game_created", "game_connected", "game_disconnected"]]):
    def __init__(self):
        super().__init__()
        self.games: dict[str, "Game"] = {}
        self.connections: dict[str, WSConnection] = {}
        self._subscriptions: dict[str, Any] = {}

    async def startup(self, msg: Startup, conn: GameWSConnection) -> "Game":
        if not (game := self.games.get(msg.game)):
            game = await Game.create(msg.game, self)
            self.games[msg.game] = game
            await self._raise_event("game_created", game)
        await game.set_connection(conn)
        return game

    async def handle(self, msg: AnyGameMessage, conn: GameWSConnection):
        if isinstance(msg, Startup):
            await self.startup(msg, conn)
            return

        if not (game := self.games.get(msg.game)):
            # IMPL: pretend we got a `startup` if first msg after reconnect isn't `startup`
            logger.warning(f"Game {msg.game} was not initialized, imitating a `startup`")
            game = await self.startup(Startup(game=msg.game), conn)
            return

        if game.connection != conn:
            if game.connection.is_connected(): # IMPL
                logger.error(f"Game {msg.game} is registered to a different active connection! (was {game.connection.ws.client}; received '{msg.command}' from {conn.ws.client})")
            # TODO: v2
            logger.warning("Reconnecting without `startup` - the spec requires a `startup` message!")
            await game.set_connection(conn)

    async def connect(self, conn: WSConnection):
        self.connections[conn.id] = conn
        if isinstance(conn, GameWSConnection):
            self._subscriptions[conn.id] = conn.subscribe("receive", partial(self.handle, conn=conn))
            await self._raise_event("game_connected", conn.game)

    async def disconnect(self, conn: WSConnection):
        self.connections.pop(conn.id, None)
        if isinstance(conn, GameWSConnection):
            await self._raise_event("game_disconnected", conn.game)
            if (unsub := self._subscriptions.pop(conn.id, None)):
                unsub()

    async def destroy(self):
        for conn in self.connections.values():
            await conn.disconnect(1001, "Server shutting down")
        self.games.clear()
        self.connections.clear()
        for unsub in self._subscriptions.values():
            unsub()

type GameEvents = Literal["connect", "disconnect"] | GameCommand | NeuroCommand

class Game(HasEvents[GameEvents]):
    def __init__(self, name: str, registry: Registry):
        super().__init__()
        self.name = name
        self.registry = registry
        self.actions: dict[str, ActionModel] = {}
        self._seen_actions: set[str] = set()
        self.pending_actions: dict[str, Action] = {}
        self.pending_forces: dict[str, ForceAction] = {}
        self.llm: LLM
        self.scheduler: Scheduler

        self._connection: GameWSConnection = None # type: ignore
        self.subscriptions = []

    @classmethod
    async def create(cls, name: str, registry: Registry):
        game = cls(name, registry)
        game.llm = await LLM.create(game) # TODO: single LLM (again)
        game.scheduler = Scheduler(game)
        return game

    def _unsubscribe(self):
        for unsub in self.subscriptions:
            unsub()
        self.subscriptions.clear()

    def _subscribe(self, connection: GameWSConnection):
        self._unsubscribe()
        self.subscriptions.extend([
            connection.subscribe("receive", self.handle),
            connection.subscribe("disconnect", self._disconnected),
        ])

    @property
    def connection(self) -> GameWSConnection:
        return self._connection

    async def set_connection(self, conn: GameWSConnection):
        if self._connection is conn:
            logger.debug(f"connection is already {conn.id}")
            return

        # IMPL: game already connected
        if self._connection and self._connection.is_connected():
            # IMPL: different active connection
            logger.warning(f"Game '{self.name}' received connection from {conn.ws.client}, but is already actively connected to {self._connection.ws.client}!")
            policy = CONFIG.gary.existing_connection_policy
            conn_to_close = self._connection if policy == ConflictResolutionPolicy.DROP_EXISTING else conn
            logger.info(f"Disconnecting {conn_to_close.ws.client} according to policy {policy}")
            if policy == ConflictResolutionPolicy.DROP_INCOMING:
                await conn.disconnect(1002, "Multiple connections are not allowed")
                return
            else:
                await self._connection.disconnect(1012, "Changing connections")

        self._connection = conn

        if conn.game and conn.game is not self:
            logger.error(f"set_connection: conn already has game! {conn.game.name}")
            # conn.game._unsubscribe()
            # conn.game._connection = None
        conn.game = self
        self._subscribe(conn)
        await self._connected()

    async def action_register(self, actions: list[ActionModel]):
        for action in actions:
            # IMPL: action register conflict
            # i think dropping existing actions is more sensible
            # that said, neither behaviour should be relied upon
            if action.name in self.actions:
                logger.warning(f"Action {action.name} already registered")
                policy = CONFIG.gary.existing_action_policy
                if policy == ConflictResolutionPolicy.DROP_INCOMING:
                    logger.debug(f"Ignoring incoming action {action.name} according to policy {policy}")
                    continue
                logger.debug(f"Overwriting existing action {action.name} according to policy {policy}")
            assert action.schema_ is None or isinstance(action.schema_, dict), "Schema must be None or dict"
            if action.schema_ and action.schema_.get("type") == "object":
                # stop making up random fields in the data. i am no longer asking
                action.schema_["additionalProperties"] = False # type: ignore
            self.actions[action.name] = action
            if action.name not in self._seen_actions:
                self._seen_actions.add(action.name)
                logger.debug(f"New action {action.name}: {action.description}\nSchema: {orjson.dumps(action.schema_, option=orjson.OPT_INDENT_2).decode()}")
        logger.success(f"Actions registered: {list(self.actions.keys())}")

    async def action_unregister(self, actions: list[str]):
        for action_name in actions:
            self.actions.pop(action_name, None)
        logger.success(f"Actions unregistered: {actions}")

    async def try_action(self) -> bool:
        if not self._connection.is_connected():
            return False
        if not self.actions and not CONFIG.gary.allow_yapping:
            logger.debug("No actions to try (Game.try_action)")
            return False
        self.scheduler.enqueue(TryAction())
        return True

    async def _force_any_action(self) -> bool:
        if not self.actions:
            logger.warning("No actions to force_any")
            return False
        self.scheduler.enqueue(ForceActionEvent())
        return True

    async def execute_action(self, act: Act | None, *, force: ForceAction | None = None):
        if not act:
            return
        (name, data) = act
        if name not in self.actions:
            logger.error(f"Executing unregistered action {name}")
        # IMPL: not validating data against stored action schema (guidance is just perfect like that (clueless))
        msg = Action(data=Action.Data(name=name, data=data))
        self.pending_actions[msg.data.id] = msg
        if force:
            self.pending_forces[msg.data.id] = force
        ctx = f"Executing action '{name}' with {{id: \"{msg.data.id[:6]}\", data: {msg.data.data}}}"
        await self.send_context(ctx, sender=SENDER_SYSTEM, silent=True)
        await self._raise_event("action", msg)
        await self._connection.send(msg)

    async def process_result(self, result: ActionResult):
        if not self.pending_actions.pop(result.data.id, None):
            logger.warning(f"Received result with unknown id {result.data.id}")
            # IMPL: unknown results are processed
            # return

        # IMPL: there SHOULD be a message on failure, but success doesn't require one
        ctx = f"Result for action {result.data.id[:6]}: {'Performing' if result.data.success else 'Failure'} ({result.data.message or 'no message'})"
        # TODO: v2 - retry responsibility moved to game (thank god)
        is_force = bool(force := self.pending_forces.pop(result.data.id, None))
        # TODO: should this be game sender?
        await self.send_context(ctx, sender=SENDER_SYSTEM, silent=result.data.success or is_force) # IMPL: will try acting again if failed
        # IMPL: not checking whether the actions in the previous force are still registered
        # unregistering during force retry is a dangerous edge case that is fixed by v2
        if is_force and not result.data.success:
            await self.handle(force)

    async def send_context(self, ctx: str, sender: str | None = None, silent: bool = False, ephemeral: bool = False):
        event = ContextEvent(
            ctx,
            sender=sender,
            silent=silent,
            ephemeral=ephemeral,
        )
        self.scheduler.enqueue(event)
        if not silent:
            self.scheduler.enqueue(TryAction())

    async def handle(self, msg: AnyGameMessage):
        logger.debug(f'Handling {msg.command}')
        await self._raise_event(msg.command, msg)
        match msg:
            case Startup():
                pass
            case RegisterActions():
                await self.action_register(msg.data.actions)
            case UnregisterActions():
                await self.action_unregister(msg.data.action_names)
            case Context():
                await self.send_context(msg.data.message, silent=msg.data.silent)
            case ForceAction():
                self.scheduler.enqueue(ForceActionEvent(force_message=msg))
            case ActionResult():
                await self.process_result(msg)
            case _:
                raise Exception(f"Unhandled message {msg}")

    async def _connected(self):
        logger.debug(f"{self.name} connected")
        await self.llm.gaming()
        self.scheduler.start()
        await self._raise_event("connect")

    async def _disconnected(self, *_):
        await self._raise_event("disconnect")
        await self.reset()

    async def reset(self):
        await self.llm.not_gaming()
        self.scheduler.stop()
        self._seen_actions.clear()
        self.actions.clear()
        self.pending_actions.clear()
        self.pending_forces.clear()

REGISTRY = Registry()
