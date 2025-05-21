from typing import Annotated, Any, Literal
from uuid import uuid4
from pydantic import BaseModel, Field, TypeAdapter

# pyright: reportIncompatibleVariableOverride=false
# the fields are *not* mutated, ever

type GameCommandCommon = Literal[
    "context",
    "actions/register",
    "actions/unregister",
    "actions/force",
    "action/result",
]
type GameCommandV1 = GameCommandCommon | Literal["startup"]
type GameCommandV2 = GameCommandCommon | Literal["mute", "unmute", "shutdown/ready"]
type GameCommand = GameCommandV1 | GameCommandV2

type NeuroCommandCommon = Literal["action"]
type NeuroCommandV1 = NeuroCommandCommon | Literal["actions/reregister_all"]
type NeuroCommandV2 = NeuroCommandCommon | Literal["shutdown/graceful", "shutdown/immediate"]
type NeuroCommand = NeuroCommandV1 | NeuroCommandV2

class ActionModel(BaseModel):
    name: str
    description: str = "" # IMPL: description is probably not going to be optional
    schema_: Annotated[dict[str, Any] | None, Field(alias="schema")]

class Message(BaseModel):
    command: GameCommand | NeuroCommand

class GameMessageV1(Message):
    command: GameCommandV1
    game: str | None = None # noooooooooo

class GameMessageV2(Message):
    command: GameCommandV2

GameMessage = GameMessageV1 | GameMessageV2

class NeuroMessageV1(Message):
    command: NeuroCommandV1

class NeuroMessageV2(Message):
    command: NeuroCommandV2

NeuroMessage = NeuroMessageV1 | NeuroMessageV2

# Game messages
# v1 only messages
class Startup(GameMessageV1):
    command: Literal["startup"] = "startup"

# Messages that exist in both v1 and v2
class Context(GameMessageV1, GameMessageV2):
    class Data(BaseModel):
        message: str
        silent: bool

    command: Literal["context"] = "context"
    data: Data

class RegisterActions(GameMessageV1, GameMessageV2):
    class Data(BaseModel):
        actions: list[ActionModel]

    command: Literal["actions/register"] = "actions/register"
    data: Data

class UnregisterActions(GameMessageV1, GameMessageV2):
    class Data(BaseModel):
        action_names: list[str]

    command: Literal["actions/unregister"] = "actions/unregister"
    data: Data

class ForceAction(GameMessageV1, GameMessageV2):
    class Data(BaseModel):
        state: str | None = None
        query: str
        ephemeral_context: bool | None = None
        action_names: list[str]
        main_thread: bool = True # undocumented

    command: Literal["actions/force"] = "actions/force"
    data: Data

class ActionResult(GameMessageV1, GameMessageV2):
    class Data(BaseModel):
        id: str
        success: bool
        message: str | None = None

    command: Literal["action/result"] = "action/result"
    data: Data

# Neuro messages

class Action(NeuroMessageV1):
    class Data(BaseModel):
        id: str = Field(default_factory=lambda: uuid4().hex)
        name: str
        # FIXME: unset vs null
        # if there's no schema, there should be no data - as opposed to explicit "data": null
        data: str | None = None

    command: Literal["action"] = "action"
    data: Data

# active proposals
# see https://github.com/VedalAI/neuro-game-sdk/blob/main/API/PROPOSALS.md
# and https://github.com/VedalAI/neuro-game-sdk/discussions/58

class ReregisterAllActions(NeuroMessageV1):
    command: Literal["actions/reregister_all"] = "actions/reregister_all"

class GracefulShutdown(NeuroMessageV2):
    # might be changed; see https://github.com/VedalAI/neuro-game-sdk/issues/44
    class Data(BaseModel):
        wants_shutdown: bool

    command: Literal["shutdown/graceful"] = "shutdown/graceful"
    data: Data

class ImmediateShutdown(NeuroMessageV2):
    command: Literal["shutdown/immediate"] = "shutdown/immediate"

class ShutdownReady(GameMessageV2):
    command: Literal["shutdown/ready"] = "shutdown/ready"

class Mute(GameMessageV2):
    command: Literal["mute"] = "mute"

class Unmute(GameMessageV2):
    command: Literal["unmute"] = "unmute"

# Create separate type adapters for each version
AnyGameMessageV1 = Startup | Context | RegisterActions | UnregisterActions | ForceAction | ActionResult
AnyGameMessageV2 = Context | RegisterActions | UnregisterActions | ForceAction | ActionResult | ShutdownReady | Mute | Unmute

AnyGameMessage = AnyGameMessageV1 | AnyGameMessageV2

GameMessageAdapterV1: TypeAdapter[Annotated[AnyGameMessageV1, Field(discriminator="command")]] = TypeAdapter(Annotated[AnyGameMessageV1, Field(discriminator="command")])
GameMessageAdapterV2: TypeAdapter[Annotated[AnyGameMessageV2, Field(discriminator="command")]] = TypeAdapter(Annotated[AnyGameMessageV2, Field(discriminator="command")])

AnyNeuroMessageV1 = Action | ReregisterAllActions
AnyNeuroMessageV2 = Action | GracefulShutdown | ImmediateShutdown
AnyNeuroMessage = AnyNeuroMessageV1 | AnyNeuroMessageV2

NeuroMessageAdapterV1: TypeAdapter[Annotated[AnyNeuroMessageV1, Field(discriminator="command")]] = TypeAdapter(Annotated[AnyNeuroMessageV1, Field(discriminator="command")])
NeuroMessageAdapterV2: TypeAdapter[Annotated[AnyNeuroMessageV2, Field(discriminator="command")]] = TypeAdapter(Annotated[AnyNeuroMessageV2, Field(discriminator="command")])

