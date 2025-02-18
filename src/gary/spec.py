from typing import Annotated, Any, Literal, Union
import warnings
from uuid import uuid4
from pydantic import BaseModel, Field, TypeAdapter

warnings.filterwarnings("ignore", category=UserWarning, message='Field name "schema" in ')

# pyright: reportIncompatibleVariableOverride=false
# the fields are *not* mutated, ever
# there's the option to make the base classes generic
# but pydantic doesn't pass overrides with default values down to the parent ctor)

type GameCommand = Literal[
    "startup",
    "context",
    "actions/register",
    "actions/unregister",
    "actions/force",
    "action/result",
    "shutdown/ready",
]

type NeuroCommand = Literal[
    "action",
    "actions/reregister_all",
    "shutdown/graceful",
    "shutdown/immediate",
]

class ActionModel(BaseModel):
    name: str
    description: str = "" # IMPL: description is probably not going to be optional
    schema_: Annotated[dict[str, Any] | None, Field(alias="schema")]

class Message(BaseModel):
    command: GameCommand | NeuroCommand

class GameMessage(Message):
    command: GameCommand
    game: str

class NeuroMessage(Message):
    command: NeuroCommand

# Game messages
class Startup(GameMessage):
    command: Literal["startup"] = "startup"

class Context(GameMessage):
    class Data(BaseModel):
        message: str
        silent: bool

    command: Literal["context"] = "context"
    data: Data

class RegisterActions(GameMessage):
    class Data(BaseModel):
        actions: list[ActionModel]

    command: Literal["actions/register"] = "actions/register"
    data: Data

class UnregisterActions(GameMessage):
    class Data(BaseModel):
        action_names: list[str]

    command: Literal["actions/unregister"] = "actions/unregister"
    data: Data

class ForceAction(GameMessage):
    class Data(BaseModel):
        state: str | None = None
        query: str
        ephemeral_context: bool | None = None
        action_names: list[str]
        main_thread: bool = True # undocumented

    command: Literal["actions/force"] = "actions/force"
    data: Data

class ActionResult(GameMessage):
    class Data(BaseModel):
        id: str
        success: bool
        message: str | None = None

    command: Literal["action/result"] = "action/result"
    data: Data

# Neuro messages

class Action(NeuroMessage):
    class Data(BaseModel):
        id: str = Field(default_factory=lambda: uuid4().hex)
        name: str
        data: Any | None

    command: Literal["action"] = "action"
    data: Data

# active proposals - see https://github.com/VedalAI/neuro-game-sdk/blob/main/API/PROPOSALS.md

class ReregisterAllActions(NeuroMessage):
    command: Literal["actions/reregister_all"] = "actions/reregister_all"

class GracefulShutdown(NeuroMessage):
    # might be changed; see https://github.com/VedalAI/neuro-game-sdk/issues/44
    class Data(BaseModel):
        wants_shutdown: bool

    command: Literal["shutdown/graceful"] = "shutdown/graceful"
    data: Data

class ImmediateShutdown(NeuroMessage):
    command: Literal["shutdown/immediate"] = "shutdown/immediate"

class ShutdownReady(GameMessage):
    command: Literal["shutdown/ready"] = "shutdown/ready"

AnyGameMessage = Union[Startup, Context, RegisterActions, UnregisterActions, ForceAction, ActionResult, ShutdownReady]
GameMessageAdapter: TypeAdapter[Annotated[AnyGameMessage, Field(discriminator="command")]]
GameMessageAdapter = TypeAdapter(Annotated[AnyGameMessage, Field(discriminator="command")])

AnyNeuroMessage = Union[Action, ReregisterAllActions, GracefulShutdown, ImmediateShutdown]
NeuroMessageAdapter: TypeAdapter[Annotated[AnyNeuroMessage, Field(discriminator="command")]]
NeuroMessageAdapter = TypeAdapter(Annotated[AnyNeuroMessage, Field(discriminator="command")])
